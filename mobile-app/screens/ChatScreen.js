// mobile-app/screens/ChatScreen.js

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Animated,
  Alert,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import Voice from "@react-native-voice/voice";
import * as Speech from "expo-speech";
import * as Clipboard from "expo-clipboard";
import {
  createChatSession,
  getChatSessions,
  sendChatMessage,
  getChatHistory,
} from "../api/api";

const SIDEBAR_WIDTH_MOBILE_FRACTION = 0.4; 
const WEB_BREAKPOINT = 768; 

export default function ChatScreen({ route }) {
  const navigation = useNavigation();
  const { userId, name } = route.params;
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const isWide = isWeb && width >= WEB_BREAKPOINT;

  //
  // Chat area state
  //
  const [messages, setMessages] = useState([]); 
  const [inputText, setInputText] = useState("");
  const [inputHeight, setInputHeight] = useState(40);
  const [isTyping, setIsTyping] = useState(false);

  //
  // Sessions list state (sidebar)
  //
  const [sessionsList, setSessionsList] = useState([]); 
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  //
  // Sidebar state
  //
  const [sidebarOpen, setSidebarOpen] = useState(false); 
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false); 
  const sidebarAnim = useRef(new Animated.Value(0)).current;

  //
  // Voice recognition
  //
  const [isListening, setIsListening] = useState(false);
  const [spokenText, setSpokenText] = useState("");

  //
  // Active session
  //
  const [activeSessionId, setActiveSessionId] = useState(null);

  const flatListRef = useRef();
  const typingTimeoutRef = useRef();

  //
  // TextInput auto-height
  //
  const handleContentSizeChange = useCallback((event) => {
    const contentHeight = event.nativeEvent.contentSize.height;
    const newHeight = Math.max(40, Math.min(120, contentHeight));
    setInputHeight(newHeight);
  }, []);

  //
  // Clipboard copy for long-press
  //
  const copyToClipboard = useCallback(async (text) => {
    try {
      await Clipboard.setStringAsync(text);
      Alert.alert("Copied!", "Message copied to clipboard");
    } catch (error) {
      console.error("Copy failed:", error);
      Alert.alert("Error", "Failed to copy message");
    }
  }, []);
  const handleLongPress = useCallback(
    (text) => {
      Alert.alert("Copy Message", "Do you want to copy this message?", [
        { text: "Cancel", style: "cancel" },
        { text: "Copy", onPress: () => copyToClipboard(text) },
      ]);
    },
    [copyToClipboard]
  );

  //
  // Voice handlers
  //
  const onSpeechResults = useCallback((event) => {
    if (event.value && event.value.length) {
      setSpokenText(event.value[0]);
    }
  }, []);
  const onSpeechError = useCallback((err) => {
    console.error("STT error:", err);
    setIsListening(false);
  }, []);
  const startListening = useCallback(async () => {
    try {
      setIsListening(true);
      setSpokenText("");
      await Voice.start("en-US");
    } catch (e) {
      console.error("Voice.start error:", e);
      setIsListening(false);
    }
  }, []);
  const stopListening = useCallback(async () => {
    try {
      await Voice.stop();
      setIsListening(false);
      if (spokenText.trim()) {
        setInputText(spokenText);
      }
    } catch (e) {
      console.error("Voice.stop error:", e);
      setIsListening(false);
    }
  }, [spokenText]);

  useEffect(() => {
    Voice.onSpeechResults = onSpeechResults;
    Voice.onSpeechError = onSpeechError;
    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
      Speech.stop();
    };
  }, [onSpeechResults, onSpeechError]);

  //
  // Navigation header: only on mobile/narrow shows toggle button
  //
  useEffect(() => {
    if (!isWide) {
      navigation.setOptions({
        title: "Chat with AI Preacher",
        headerRight: () => (
          <TouchableOpacity onPress={toggleSidebar} style={{ marginRight: 12 }}>
            <Text style={{ fontSize: 24, color: "#2e86de" }}>
              {sidebarOpen ? "✕" : "☰"}
            </Text>
          </TouchableOpacity>
        ),
      });
    } else {
      navigation.setOptions({
        title: "Chat with AI Preacher",
        headerRight: () => null,
      });
      // ensure sidebar overlay closed
      setSidebarOpen(false);
    }
  }, [isWide, sidebarOpen]);

  // Auto-scroll when messages or typing changes
  
  useEffect(() => {
    if (flatListRef.current && (messages.length > 0 || isTyping)) {
      setTimeout(() => {
        flatListRef.current.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages, isTyping]);


  useEffect(() => {
    (async () => {
      // 1) Load existing sessions
      const sessions = await loadSessionsList();
      if (sessions.length > 0) {
        // Auto-select the most recent session
        selectSession(sessions[0].session_id,  true);
      } else {
        await initializeNewChat();
      }
    })();
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  //
  // Load sessions list from backend; returns array
  //
  const loadSessionsList = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const res = await getChatSessions(userId);
      let arr = Array.isArray(res.data) ? res.data.slice() : [];
      // Sort descending by updated_at
      arr.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
      setSessionsList(arr);
      return arr;
    } catch (err) {
      console.error("Failed to load sessions list:", err);
      setSessionsList([]);
      return [];
    } finally {
      setLoadingSessions(false);
    }
  }, [userId]);

  //
  // Initialize a new chat session by calling backend createChatSession
  //
  const initializeNewChat = useCallback(async () => {
    try {
      const res = await createChatSession(userId);
      const session = res.data;
    
      const sessionId = session.session_id;
      setActiveSessionId(sessionId);
      setInputText("");
      setInputHeight(40);
      setIsTyping(false);

      // Welcome bubble
      const welcomeBubble = {
        id: `welcome-${sessionId}`,
        type: "ai",
        text: `Welcome ${name}, you’re in the right place. How can I help you today?`,
        created_at: new Date().toISOString(),
        sessionId,
      };
      setMessages([welcomeBubble]);

      // Prepend new session in sidebar
      setSessionsList((prev) => [
        { 
          session_id: sessionId, 
          title: session.title || "(New Chat)", 
          created_at: session.created_at, 
          updated_at: session.updated_at 
        },
        ...prev,
      ]);
    } catch (err) {
      console.error("Failed to create new chat session:", err);
      // Fallback: client-generated sessionId
      const sessionId = `session-${Date.now()}`;
      setActiveSessionId(sessionId);
      setInputText("");
      setInputHeight(40);
      setIsTyping(false);
      const welcomeBubble = {
        id: `welcome-${sessionId}`,
        type: "ai",
        text: `Welcome ${name}, you’re in the right place. How can I help you today?`,
        created_at: new Date().toISOString(),
        sessionId,
      };
      setMessages([welcomeBubble]);
      setSessionsList((prev) => [
        {
          session_id: sessionId,
          title: "(New Chat)",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        ...prev,
      ]);
    }
  }, [userId, name]);

  //
  // Fetch full history for selected session
  //
  const fetchHistoryForSidebar = useCallback(async (sessionIdParam) => {
    const sessionIdToUse = sessionIdParam || activeSessionId;
    if (!sessionIdToUse) return;
    setLoadingHistory(true);
    try {
      const res = await getChatHistory(userId, sessionIdToUse);
      const flat = [];
      res.data.forEach((entry) => {
        if (entry.user_message) {
          flat.push({
            id: `u-${entry.id}-${sessionIdToUse}`,
            type: "user",
            text: entry.user_message,
            created_at: entry.created_at,
            sessionId: entry.session_id || sessionIdToUse,
          });
        }
        if (entry.ai_response) {
          flat.push({
            id: `a-${entry.id}-${sessionIdToUse}`,
            type: "ai",
            text: entry.ai_response,
            created_at: entry.created_at,
            sessionId: entry.session_id || sessionIdToUse,
          });
        }
      });
      flat.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      setMessages(flat);

      // Update updated_at preview in sessionsList
      setSessionsList((prev) =>
        prev.map((s) =>
          s.session_id === sessionIdToUse
            ? { ...s, updated_at: new Date().toISOString() }
            : s
        )
      );
    } catch (err) {
      console.error("History fetch failed:", err);
      setMessages([]); 
    } finally {
      setLoadingHistory(false);
    }
  }, [userId, activeSessionId]);

  // Sidebar toggle on mobile
  const toggleSidebar = useCallback(() => {
    if (isWide) return;
    const sidebarWidth = width * SIDEBAR_WIDTH_MOBILE_FRACTION;
    const toValue = sidebarOpen ? sidebarWidth : 0;
    Animated.timing(sidebarAnim, {
      toValue,
      duration: 250,
      useNativeDriver: true,
    }).start();
    setSidebarOpen((prev) => !prev);
    if (!sidebarOpen) {
      loadSessionsList();
    }
  }, [sidebarOpen, sidebarAnim, width, isWide, loadSessionsList]);

  // Start new chat from sidebar
  const startNewChat = useCallback(async () => {
    await initializeNewChat();
    if (!isWide && sidebarOpen) {
      toggleSidebar();
    }
  }, [initializeNewChat, isWide, sidebarOpen, toggleSidebar]);

  const selectSession = useCallback((session_id, fromMount = false) => {
    setActiveSessionId(session_id);
    fetchHistoryForSidebar(session_id);
    if (!isWide && sidebarOpen && !fromMount) {
      toggleSidebar();
    }
  }, [isWide, sidebarOpen, fetchHistoryForSidebar, toggleSidebar]);


  // Handle sending a message
  const handleSend = useCallback(async () => {
    if (!inputText.trim() || isTyping) return;
    const generatedId = (prefix) =>
      `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const sessionIdToUse = activeSessionId;
    if (!sessionIdToUse) {
      Alert.alert("Session error", "No active session. Please start a new chat.");
      return;
    }
    const nowIso = new Date().toISOString();
    const userMessage = {
      id: generatedId("u"),
      type: "user",
      text: inputText,
      created_at: nowIso,
      sessionId: sessionIdToUse,
    };
    // Append user message
    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setInputHeight(40);
    setIsTyping(true);

    // Update preview for sessionsList
    setSessionsList((prev) =>
      prev.map((s) =>
        s.session_id === sessionIdToUse
          ? {
              ...s,
              title:
                s.title === "(New Chat)" || !s.title
                  ? userMessage.text
                  : s.title,
              updated_at: nowIso,
              first_user_message:
                s.first_user_message === "(New Chat)"
                  ? userMessage.text
                  : s.first_user_message,
            }
          : s
      )
    );

    try {
      const res = await sendChatMessage(userId, sessionIdToUse, inputText);
      const aiReply = {
        id: generatedId("a"),
        type: "ai",
        text: res.data.reply,
        created_at: new Date().toISOString(),
        sessionId: sessionIdToUse,
      };
      // Brief typing delay so user sees indicator
      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
        setMessages((prev) => [...prev, aiReply]);
        setSessionsList((prev) =>
          prev.map((s) =>
            s.session_id === sessionIdToUse
              ? { ...s, updated_at: new Date().toISOString() }
              : s
          )
        );
        Speech.stop();
        Speech.speak(aiReply.text, {
          language: "en-US",
          pitch: 1.0,
          rate: 1.0,
        });
      }, 800);
    } catch (err) {
      console.error("Send error:", err);
      setIsTyping(false);
      const errorMsg = {
        id: generatedId("error"),
        type: "error",
        text: "Something went wrong. Please try again later.",
        created_at: new Date().toISOString(),
        sessionId: sessionIdToUse,
      };
      setMessages((prev) => [...prev, errorMsg]);
    }
  }, [inputText, isTyping, userId, activeSessionId]);

  
  // Render each message item
  const renderItem = useCallback(
    ({ item }) => (
      <Pressable onLongPress={() => handleLongPress(item.text)} delayLongPress={500}>
        <View
          style={[
            styles.messageBubble,
            item.type === "user"
              ? styles.userBubble
              : item.type === "ai"
              ? styles.aiBubble
              : styles.errorBubble,
          ]}
        >
          <Text style={styles.messageText}>{item.text}</Text>
          <Text style={styles.timestampText}>{formatTime(item.created_at)}</Text>
        </View>
      </Pressable>
    ),
    [handleLongPress]
  );
  const keyExtractor = useCallback((item) => item.id, []);

  // FlatList performance props
  const flatListProps = {
    initialNumToRender: 20,
    maxToRenderPerBatch: 20,
    windowSize: 10,
    removeClippedSubviews: true,
  };
  const ListFooterComponent = isTyping ? (
    <View style={[styles.messageBubble, styles.aiBubble, styles.typingBubble]}>
      <TypingDots />
    </View>
  ) : null;

  // Sidebar width on mobile overlay
  const sidebarWidthMobile = width * SIDEBAR_WIDTH_MOBILE_FRACTION;

  // Main render
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={isWide ? styles.containerRow : styles.container}>
        {/* Wide sidebar */}
        {isWide && (
          sidebarCollapsed ? (
            <View style={styles.sidebarCollapsed}>
              <TouchableOpacity
                onPress={() => setSidebarCollapsed(false)}
                style={styles.collapseToggle}
              >
                <Text style={styles.collapseToggleText}>›</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.sidebarWide}>
              <View style={styles.sidebarHeader}>
                <TouchableOpacity
                  onPress={() => setSidebarCollapsed(true)}
                  style={styles.collapseToggle}
                >
                  <Text style={styles.collapseToggleText}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.sidebarHeaderTitle}>History</Text>
              </View>
              <ScrollView
                contentContainerStyle={styles.sidebarContent}
                showsVerticalScrollIndicator={false}
              >
                <TouchableOpacity style={styles.newChatButton} onPress={startNewChat}>
                  <Text style={styles.newChatText}>📝 Start New Chat</Text>
                </TouchableOpacity>
                <Text style={styles.sidebarTitle}>Chat Sessions</Text>
                {loadingSessions ? (
                  <ActivityIndicator size="small" color="#128C7E" />
                ) : (
                  sessionsList.map((sess) => (
                    <TouchableOpacity
                      key={sess.session_id}
                      onPress={() => selectSession(sess.session_id)}
                      style={[
                        styles.historyItemContainer,
                        sess.session_id === activeSessionId && styles.historyItemActive,
                      ]}
                    >
                      <Text style={styles.historyItemText}>
                        {truncateText(sess.title || "(No preview)", 30)}
                      </Text>
                      <Text style={styles.historyTime}>
                        {formatTime(sess.updated_at)}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            </View>
          )
        )}

        {/* Chat area */}
        <View style={styles.chatArea}>
          {/* Overlay sidebar on mobile */}
          {!isWide && sidebarOpen && (
            <Pressable style={styles.backdrop} onPress={toggleSidebar} />
          )}
          {!isWide && sidebarOpen && (
            <Animated.View
              style={[
                styles.sidebarOverlay,
                {
                  width: sidebarWidthMobile,
                  transform: [{ translateX: sidebarAnim }],
                },
              ]}
            >
              <ScrollView
                contentContainerStyle={styles.sidebarContent}
                showsVerticalScrollIndicator={false}
              >
                <TouchableOpacity style={styles.newChatButton} onPress={startNewChat}>
                  <Text style={styles.newChatText}>📝 Start New Chat</Text>
                </TouchableOpacity>
                <Text style={styles.sidebarTitle}>Chat Sessions</Text>
                {loadingSessions ? (
                  <ActivityIndicator size="small" color="#128C7E" />
                ) : (
                  sessionsList.map((sess) => (
                    <TouchableOpacity
                      key={sess.session_id}
                      onPress={() => selectSession(sess.session_id)}
                      style={[
                        styles.historyItemContainer,
                        sess.session_id === activeSessionId && styles.historyItemActive,
                      ]}
                    >
                      <Text style={styles.historyItemText}>
                        {truncateText(sess.title || "(No preview)", 30)}
                      </Text>
                      <Text style={styles.historyTime}>
                        {formatTime(sess.updated_at)}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            </Animated.View>
          )}

          {/* Chat messages + input */}
          <KeyboardAvoidingView
            style={styles.chatBackground}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 80}
          >
            <FlatList
              ref={flatListRef}
              data={messages}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              contentContainerStyle={styles.flatListContent}
              keyboardShouldPersistTaps="handled"
              ListFooterComponent={ListFooterComponent}
              {...flatListProps}
            />
            {/* Input section */}
            <View style={styles.inputSection}>
              <View style={styles.inputContainer}>
                <TextInput
                  style={[styles.input, { height: inputHeight }]}
                  value={inputText}
                  onChangeText={setInputText}
                  onContentSizeChange={handleContentSizeChange}
                  multiline
                  placeholder="Type your message"
                  placeholderTextColor="#999"
                />
                <TouchableOpacity
                  onPress={handleSend}
                  disabled={!inputText.trim() || isTyping}
                  style={[
                    styles.sendButton,
                    (!inputText.trim() || isTyping) && { opacity: 0.5 },
                  ]}
                >
                  <Text style={styles.sendIcon}>➤</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={isListening ? stopListening : startListening}
                  style={[styles.micButton, isListening && styles.micButtonActive]}
                >
                  <Text style={styles.micIcon}>{isListening ? "🎙️" : "🎤"}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.disclaimer}>
                <Text style={styles.disclaimerText}>
                  This is an AI-powered preacher. It is not a substitute for real pastoral counseling.
                </Text>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </View>
    </SafeAreaView>
  );
}

// Helpers

function formatTime(timestamp) {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours < 12 ? "AM" : "PM";
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${ampm}`;
}

function truncateText(text, maxLen) {
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen - 1) + "…" : text;
}

const TypingDots = () => {
  const dotAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dotAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(dotAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <View style={{ flexDirection: "row" }}>
      {[0, 1, 2].map((i) => (
        <Animated.Text
          key={i}
          style={{
            fontSize: 18,
            fontWeight: "bold",
            marginHorizontal: 2,
            opacity: dotAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
          }}
        >
          ●
        </Animated.Text>
      ))}
    </View>
  );
};

// Styles (reuse your existing styles but ensure the new style keys are present)
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#e5ddd5",
  },
  containerRow: {
    flex: 1,
    flexDirection: "row",
  },
  container: {
    flex: 1,
  },
  // Wide sidebar expanded/collapsed
  sidebarWide: {
    width: 300,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },
  sidebarCollapsed: {
    width: 50,
    backgroundColor: "#fff",
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  collapseToggle: {
    padding: 8,
  },
  collapseToggleText: {
    fontSize: 20,
    color: "#2e86de",
  },
  sidebarHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
  },
  sidebarHeaderTitle: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  chatArea: {
    flex: 1,
    position: "relative",
  },
  // Overlay sidebar on mobile
  sidebarOverlay: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#fff",
    zIndex: 10,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
    shadowColor: "#000",
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 10,
  },
  backdrop: {
    position: "absolute",
    left: 0,
    top: 0,
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(0,0,0,0.4)",
    zIndex: 5,
  },
  sidebarContent: {
    padding: 16,
    paddingTop: 20,
  },
  newChatButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#128C7E",
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  newChatText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  sidebarTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 20,
    color: "#128C7E",
    textAlign: "center",
  },
  historyItemContainer: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#eee",
  },
  historyItemActive: {
    backgroundColor: "#e0f7fa", // highlight active session
  },
  historyItemText: {
    fontSize: 14,
    color: "#333",
    marginBottom: 4,
  },
  historyTime: {
    fontSize: 12,
    color: "#888",
  },
  chatBackground: {
    flex: 1,
    backgroundColor: "#e5ddd5",
  },
  flatListContent: {
    padding: 10,
    paddingBottom: 20,
  },
  messageBubble: {
    marginVertical: 6,
    padding: 12,
    borderRadius: 10,
    maxWidth: "85%",
    flexDirection: "column",
    flexShrink: 1,
  },
  aiBubble: {
    backgroundColor: "#ffffff",
    alignSelf: "flex-start",
    borderTopLeftRadius: 2,
  },
  userBubble: {
    backgroundColor: "#dcf8c6",
    alignSelf: "flex-end",
    borderTopRightRadius: 2,
  },
  errorBubble: {
    backgroundColor: "#f8d7da",
    alignSelf: "center",
  },
  typingBubble: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
    flexWrap: "wrap",
  },
  timestampText: {
    fontSize: 10,
    color: "#666",
    marginTop: 4,
    alignSelf: "flex-end",
  },
  inputSection: {
    backgroundColor: "#f0f0f0",
    paddingBottom: Platform.OS === "android" ? 20 : 0,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: "#f0f0f0",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#ccc",
  },
  input: {
    flex: 1,
    marginRight: 8,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    backgroundColor: "#ffffff",
    fontSize: 16,
    minHeight: 40,
    maxHeight: 120,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
    color: "#333",
  },
  sendButton: {
    backgroundColor: "#128C7E",
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  sendIcon: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  micButton: {
    marginLeft: 8,
    backgroundColor: "#128C7E",
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  micButtonActive: {
    backgroundColor: "#FF5252",
  },
  micIcon: {
    fontSize: 18,
    color: "#fff",
  },
  disclaimer: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "#f9f9f9",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e0e0e0",
  },
  disclaimerText: {
    fontSize: 11,
    color: "#888",
    textAlign: "center",
  },
});

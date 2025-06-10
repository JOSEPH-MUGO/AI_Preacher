// mobile-app/screens/ChatScreen.js

import React, { useState, useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
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
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import Voice from "@react-native-voice/voice"; // STT
import * as Speech from "expo-speech";
import { sendChatMessage, getChatHistory } from "../api/api";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const SIDEBAR_WIDTH = SCREEN_WIDTH * 0.75; // Sidebar covers 75% of screen width

export default function ChatScreen({ route }) {
  const navigation = useNavigation();
  const { userId, name } = route.params;

  // Main chat state
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  // Full history (flattened) + grouped by date
  const [allHistory, setAllHistory] = useState([]);
  const [groupedHistory, setGroupedHistory] = useState([]);

  // Sidebar state & animation
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarAnim = useRef(new Animated.Value(SIDEBAR_WIDTH)).current;

  // Refs
  const flatListRef = useRef();
  const [isListening, setIsListening] = useState(false);
  const [spokenText, setSpokenText] = useState("");

  // On mount: fetch history and set header button
  useEffect(() => {
    // Attach the handlers
    Voice.onSpeechResults = onSpeechResults;
    Voice.onSpeechError = onSpeechError;

    // Cleanup on unmount
    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  async function startListening() {
    try {
      setIsListening(true);
      setSpokenText("");
      // 'en-US' for English; or switch to 'sw-KE' for Swahili STT if desired
      await Voice.start("en-US");
    } catch (e) {
      console.error("Voice.start error:", e);
      setIsListening(false);
    }
  }

  async function stopListening() {
    try {
      await Voice.stop();
      setIsListening(false);
      if (spokenText.trim()) {
        // feed the recognized text into your existing send flow
        setInputText(spokenText);
        handleSend();
      }
    } catch (e) {
      console.error("Voice.stop error:", e);
      setIsListening(false);
    }
  }

  useEffect(() => {
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

    const welcomeBubble = {
      id: "welcome",
      type: "ai",
      text: `Welcome ${name}, you’re in the right place. How can I help you today?`,
      created_at: new Date().toISOString(),
    };

    fetchHistory(welcomeBubble);
  }, []);

  // Update header icon when sidebar toggles
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={toggleSidebar} style={{ marginRight: 12 }}>
          <Text style={{ fontSize: 24, color: "#2e86de" }}>
            {sidebarOpen ? "✕" : "☰"}
          </Text>
        </TouchableOpacity>
      ),
    });
  }, [sidebarOpen]);

  function onSpeechResults(event) {
    if (event.value && event.value.length) {
      setSpokenText(event.value[0]);
    }
  }

  // Called if STT engine errors out
  function onSpeechError(err) {
    console.error("STT error:", err);
    setIsListening(false);
  }

  function fetchHistory(welcomeBubble) {
    getChatHistory(userId)
      .then((res) => {
        // Flatten each chat_history row into user/ai messages
        const flat = [];
        res.data.forEach((entry) => {
          if (entry.user_message) {
            flat.push({
              id: `u-${entry.id}`,
              type: "user",
              text: entry.user_message,
              created_at: entry.created_at,
            });
          }
          if (entry.ai_response) {
            flat.push({
              id: `a-${entry.id}`,
              type: "ai",
              text: entry.ai_response,
              created_at: entry.created_at,
            });
          }
        });
        setAllHistory(flat);

        // Group messages by date (Today / Yesterday / Older)
        const grouped = groupByDate(flat);
        setGroupedHistory(grouped);

        // Show only Today's messages in the main view (plus the welcome bubble)
        const todayKey = new Date().toDateString();
        const todayMsgs = flat.filter(
          (msg) => new Date(msg.created_at).toDateString() === todayKey
        );
        setMessages([welcomeBubble, ...todayMsgs]);
      })
      .catch((err) => {
        console.error("History fetch failed:", err);
        setMessages([{ ...welcomeBubble }]);
      });
  }

  // Toggle sidebar open/close with animation
  const toggleSidebar = () => {
    const toValue = sidebarOpen ? SIDEBAR_WIDTH : 0;
    Animated.timing(sidebarAnim, {
      toValue,
      duration: 250,
      useNativeDriver: true,
    }).start();
    setSidebarOpen((prev) => !prev);
  };

  // When a date group is tapped, load that day's messages
  const loadDay = (dateKey) => {
    const dayMsgs = allHistory.filter(
      (msg) => new Date(msg.created_at).toDateString() === dateKey
    );

    const headerBubble = {
      id: `header-${dateKey}`,
      type: "ai",
      text: `Conversation from ${formatDateGroup(dateKey)}:`,
      created_at: new Date().toISOString(),
    };

    let newMsgs;
    if (dayMsgs.length === 0) {
      newMsgs = [
        headerBubble,
        {
          id: `none-${dateKey}`,
          type: "ai",
          text: "No messages found for this date.",
          created_at: new Date().toISOString(),
        },
      ];
    } else {
      newMsgs = [headerBubble, ...dayMsgs];
    }

    setMessages(newMsgs);
    toggleSidebar();
  };

  // Handle sending a new message
  const handleSend = async () => {
    if (!inputText.trim()) return;

    // Immediately add the user's message
    const userMessage = {
      id: `u-temp-${Date.now()}`,
      type: "user",
      text: inputText,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setIsTyping(true);

    try {
      const res = await sendChatMessage(userId, inputText);
      const aiReply = {
        id: `a-temp-${Date.now()}`,
        type: "ai",
        text: res.data.reply,
        created_at: new Date().toISOString(),
      };

      // Add to all history in memory
      const newAll = [...allHistory, userMessage, aiReply];
      setAllHistory(newAll);
      setGroupedHistory(groupByDate(newAll));

      // Show “typing” dots briefly, then append reply
      setTimeout(() => {
        setMessages((prev) => [...prev, aiReply]);
        Speech.speak(aiReply.text, {
          language: "en-US", // or 'sw-KE' if you're in Swahili mode
          pitch: 1.0,
          rate: 1.0,
        });
        setIsTyping(false);
      }, 1500);
    } catch (err) {
      console.error("Send error:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          type: "error",
          text: "Something went wrong. Please try again.",
          created_at: new Date().toISOString(),
        },
      ]);
      setIsTyping(false);
    }
  };

  // Whenever messages change, scroll to bottom
  useEffect(() => {
    if (flatListRef.current && messages.length > 0) {
      setTimeout(() => {
        flatListRef.current.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* If sidebar is open, render a full‐screen backdrop that closes it */}
      {sidebarOpen && (
        <Pressable style={styles.backdrop} onPress={toggleSidebar} />
      )}

      {/* Main column: Chat area + Bottom input section */}
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 80}
      >
        {/* =============== CHAT AREA =============== */}
        <View style={styles.chatBackground}>
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.flatListContent}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
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
                <Text style={styles.timestampText}>
                  {formatTime(item.created_at)}
                </Text>
              </View>
            )}
          />

          {isTyping && (
            <View
              style={[
                styles.messageBubble,
                styles.aiBubble,
                styles.typingBubble,
              ]}
            >
              <TypingDots />
            </View>
          )}
        </View>

        {/* =============== BOTTOM INPUT SECTION =============== */}
        <View style={styles.inputSection}>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Type your message"
              placeholderTextColor="#999"
              returnKeyType="send"
              onSubmitEditing={handleSend}
              enablesReturnKeyAutomatically={true}
            />
            <TouchableOpacity onPress={handleSend} style={styles.sendButton}>
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
              This is an AI-powered preacher. It is not a substitute for real
              pastoral counseling.
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* =============== SIDEBAR =============== */}
      <Animated.View
        style={[styles.sidebar, { transform: [{ translateX: sidebarAnim }] }]}
      >
        <ScrollView
          contentContainerStyle={styles.sidebarContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sidebarTitle}>Chat History</Text>
          {groupedHistory.map((group) => (
            <View key={group.dateKey} style={styles.groupBlock}>
              <Text style={styles.groupHeader}>
                {formatDateGroup(group.dateKey)}
              </Text>
              {group.items.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => loadDay(group.dateKey)}
                  style={styles.historyItemContainer}
                >
                  <Text style={styles.historyItemText}>
                    {truncateText(
                      item.type === "user"
                        ? `You: ${item.text}`
                        : `AI: ${item.text}`,
                      30
                    )}
                  </Text>
                  <Text style={styles.historyTime}>
                    {formatTime(item.created_at)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

// ——— Helpers ——————————————————————————————

/**
 * Group a flat array of messages by calendar date (e.g. "Mon Jun 02 2025")
 * Returns an array of { dateKey, items } sorted descending (newest date first).
 */
function groupByDate(flatMsgs) {
  const groups = {};
  flatMsgs.forEach((msg) => {
    const dateKey = new Date(msg.created_at).toDateString();
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(msg);
  });
  const sortedKeys = Object.keys(groups).sort(
    (a, b) => new Date(b) - new Date(a)
  );
  return sortedKeys.map((key) => ({
    dateKey: key,
    items: groups[key],
  }));
}

/**
 * Given a dateKey string ("Mon Jun 02 2025"), returns
 * "Today" / "Yesterday" / or "Jun 2, 2025".
 */
function formatDateGroup(dateKey) {
  const todayKey = new Date().toDateString();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toDateString();
  if (dateKey === todayKey) return "Today";
  if (dateKey === yesterdayKey) return "Yesterday";
  return new Date(dateKey).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Format a timestamp "…T14:23:45.000Z" as "14:23" */
function formatTime(timestamp) {
  const d = new Date(timestamp);
  const hrs = d.getHours();
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${hrs}:${mins}`;
}

/** Truncate a long string to maxLen, adding an ellipsis if needed */
function truncateText(text, maxLen) {
  return text.length > maxLen ? text.slice(0, maxLen - 1) + "…" : text;
}

/** Three animated dots (typing indicator) */
const TypingDots = () => {
  const dotAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(dotAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(dotAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ])
    ).start();
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
            opacity: dotAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0.3, 1],
            }),
          }}
        >
          ●
        </Animated.Text>
      ))}
    </View>
  );
};

// ——— Styles ——————————————————————————————
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#e5ddd5", // WhatsApp‐style chat background
  },
  container: {
    flex: 1,
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
  },
  timestampText: {
    fontSize: 10,
    color: "#666",
    marginTop: 4,
    alignSelf: "flex-end",
  },
  // ========== Bottom input section ==========
  inputSection: {
    backgroundColor: "#f0f0f0",
    // Add bottom padding to ensure we sit above nav buttons.
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
  // ========== Disclaimer ==========
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
  // ========== Sidebar ==========
  backdrop: {
    position: "absolute",
    left: 0,
    top: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: "rgba(0,0,0,0.4)",
    zIndex: 5,
  },
  sidebar: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: SIDEBAR_WIDTH,
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
  sidebarContent: {
    padding: 16,
    paddingTop: 20,
  },
  sidebarTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 20,
    color: "#128C7E",
    textAlign: "center",
  },
  groupBlock: {
    marginBottom: 24,
  },
  groupHeader: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
    color: "#333",
    backgroundColor: "#f0f0f0",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  historyItemContainer: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#eee",
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
});

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { getDenominations, registerUser } from '../api/api';

export default function RegisterScreen({ navigation }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mood, setMood] = useState('');
  const [denominations, setDenominations] = useState([]);
  const [selectedDenomination, setSelectedDenomination] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getDenominations().then(res => setDenominations(res.data));
  }, []);

  const handleRegister = async () => {
    setError('');
    try {
      const response = await registerUser({
        name,
        email,
        mood,
        denomination_id: selectedDenomination,
      });
      const user = response.data; 
      navigation.navigate('Chat', { userId: user.id, name: user.name });
    } catch (err) {
      if (err.response?.data?.error === 'Email already exists with another user.') {
        setError('Email already exists with another user.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <Text style={styles.title}>AI Preacher</Text>
      <Text style={styles.subtitle}>
        Get personalized comfort and gospel insights based on your mood
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TextInput
        style={styles.input}
        placeholder="Name"
        placeholderTextColor="#999"
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#999"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="How are you feeling?"
        placeholderTextColor="#999"
        value={mood}
        onChangeText={setMood}
      />

      <View style={styles.pickerWrapper}>
        <Picker
          selectedValue={selectedDenomination}
          onValueChange={setSelectedDenomination}
          style={styles.picker}
        >
          <Picker.Item label="Select Your Denomination" value="" />
          {denominations.map(d => (
            <Picker.Item key={d.id} label={d.name} value={d.id} />
          ))}
        </Picker>
      </View>

      <TouchableOpacity
        style={[
          styles.button,
          { backgroundColor: selectedDenomination ? '#2e86de' : '#ccc' },
        ]}
        onPress={handleRegister}
        disabled={!selectedDenomination}
      >
        <Text style={styles.buttonText}>Start Chat</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: '#f4f6fc',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    color: '#2e86de',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    color: '#555',
    marginBottom: 20,
  },
  input: {
    height: 48,
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 16,
    backgroundColor: '#fff',
    marginBottom: 14,
  },
  pickerWrapper: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginBottom: 20,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  picker: {
    height: 48,
  },
  button: {
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  error: {
    color: '#d63031',
    textAlign: 'center',
    marginBottom: 10,
    fontSize: 14,
  },
});

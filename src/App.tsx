/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Mic, 
  Square, 
  Play, 
  Pause, 
  Trash2, 
  FileText, 
  MessageSquare, 
  History, 
  Settings, 
  Loader2, 
  Send,
  ChevronRight,
  ChevronLeft,
  Volume2,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import Markdown from 'react-markdown';
import { format } from 'date-fns';
import { cn } from './lib/utils';
import { Recording, Message } from './types';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export default function App() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [selectedRecordingId, setSelectedRecordingId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'record' | 'history' | 'chat'>('record');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const chatRef = useRef<any>(null);
  const recordingTimeRef = useRef(0);

  const selectedRecording = recordings.find(r => r.id === selectedRecordingId);

  // Timer logic
  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => {
          const newTime = prev + 1;
          recordingTimeRef.current = newTime;
          return newTime;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording, isPaused]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (blob.size === 0) return; // Prevent saving empty recordings

        const url = URL.createObjectURL(blob);
        const newRecording: Recording = {
          id: crypto.randomUUID(),
          blob,
          url,
          duration: recordingTimeRef.current,
          timestamp: new Date(),
        };
        setRecordings(prev => [newRecording, ...prev]);
        setRecordingTime(0);
        recordingTimeRef.current = 0;
        setSelectedRecordingId(newRecording.id);
        setActiveTab('history');
      };

      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);
      recordingTimeRef.current = 0;
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Please allow microphone access to record audio.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      setIsPaused(false);
    }
  };

  const togglePause = () => {
    if (mediaRecorderRef.current && isRecording) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
      } else {
        mediaRecorderRef.current.pause();
      }
      setIsPaused(!isPaused);
    }
  };

  const deleteRecording = (id: string) => {
    setRecordings(prev => prev.filter(r => r.id !== id));
    if (selectedRecordingId === id) setSelectedRecordingId(null);
  };

  const transcribeAudio = async (recording: Recording) => {
    if (recording.transcription || recording.isTranscribing) return;

    setRecordings(prev => prev.map(r => 
      r.id === recording.id ? { ...r, isTranscribing: true } : r
    ));

    try {
      const reader = new FileReader();
      reader.readAsDataURL(recording.blob);
      
      const base64Data = await new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
      });

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              { text: "Transcribe this audio accurately in its original language. If there are multiple speakers, try to distinguish them. Provide only the transcription text." },
              { inlineData: { data: base64Data, mimeType: "audio/webm" } }
            ]
          }
        ],
        config: {
          systemInstruction: "You are a professional transcriber. Your goal is to provide a verbatim transcription of the provided audio. Do not summarize or add commentary."
        }
      });

      const transcription = response.text || "Transcription failed.";
      
      setRecordings(prev => prev.map(r => 
        r.id === recording.id ? { ...r, transcription, isTranscribing: false } : r
      ));
    } catch (err) {
      console.error("Transcription error:", err);
      setRecordings(prev => prev.map(r => 
        r.id === recording.id ? { ...r, isTranscribing: false } : r
      ));
      alert("Transcription failed. The file might be too large or there was an API error.");
    }
  };

  const handleSendMessage = async () => {
    if (!userInput.trim() || isChatLoading) return;

    const newUserMessage: Message = { role: 'user', text: userInput };
    setChatMessages(prev => [...prev, newUserMessage]);
    setUserInput('');
    setIsChatLoading(true);

    try {
      if (!chatRef.current) {
        chatRef.current = ai.chats.create({
          model: "gemini-3.1-pro-preview",
          config: {
            systemInstruction: "You are a helpful assistant for a voice transcription app. You can help users analyze their transcriptions, summarize them, or answer questions about the recorded content. Be concise and professional."
          }
        });
      }

      // Include transcription context if a recording is selected, but only on the first message
      // to avoid repeating the context and wasting tokens.
      let messageText = userInput;
      if (selectedRecording?.transcription && chatMessages.length === 0) {
        messageText = `Context from current transcription: "${selectedRecording.transcription}"\n\nUser Question: ${userInput}`;
      }

      const response = await chatRef.current.sendMessage({ message: messageText });
      const modelMessage: Message = { role: 'model', text: response.text || "I'm sorry, I couldn't process that." };
      setChatMessages(prev => [...prev, modelMessage]);
    } catch (err) {
      console.error("Chat error:", err);
      setChatMessages(prev => [...prev, { role: 'model', text: "Error connecting to AI. Please try again." }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs > 0 ? hrs.toString().padStart(2, '0') + ':' : ''}${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans overflow-hidden">
      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: sidebarOpen ? 280 : 0, opacity: sidebarOpen ? 1 : 0 }}
        className="bg-white border-r border-[#E5E7EB] flex flex-col overflow-hidden"
      >
        <div className="p-6 border-bottom border-[#E5E7EB]">
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <div className="w-8 h-8 bg-[#1A1A1A] rounded-lg flex items-center justify-center">
              <Mic className="w-5 h-5 text-white" />
            </div>
            Voice Pro
          </h1>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => setActiveTab('record')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
              activeTab === 'record' ? "bg-[#F3F4F6] font-semibold" : "hover:bg-[#F9FAFB] text-gray-500"
            )}
          >
            <Mic className="w-5 h-5" />
            Record
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
              activeTab === 'history' ? "bg-[#F3F4F6] font-semibold" : "hover:bg-[#F9FAFB] text-gray-500"
            )}
          >
            <History className="w-5 h-5" />
            History
          </button>
          <button 
            onClick={() => setActiveTab('chat')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
              activeTab === 'chat' ? "bg-[#F3F4F6] font-semibold" : "hover:bg-[#F9FAFB] text-gray-500"
            )}
          >
            <MessageSquare className="w-5 h-5" />
            AI Assistant
          </button>
        </nav>

        <div className="p-4 border-t border-[#E5E7EB]">
          <div className="flex items-center gap-3 px-4 py-3 text-gray-500">
            <Settings className="w-5 h-5" />
            Settings
          </div>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-[#E5E7EB] bg-white flex items-center justify-between px-6 z-10">
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </button>
          
          <div className="flex items-center gap-4">
            {isRecording && (
              <div className="flex items-center gap-2 px-3 py-1 bg-red-50 text-red-600 rounded-full text-sm font-medium animate-pulse">
                <div className="w-2 h-2 bg-red-600 rounded-full" />
                Recording {formatTime(recordingTime)}
              </div>
            )}
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8 max-w-5xl mx-auto w-full">
          <AnimatePresence mode="wait">
            {activeTab === 'record' && (
              <motion.div 
                key="record"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex flex-col items-center justify-center h-full space-y-12"
              >
                <div className="text-center space-y-4">
                  <h2 className="text-4xl font-bold tracking-tight">Capture your thoughts</h2>
                  <p className="text-gray-500 max-w-md mx-auto">
                    High-quality voice recording with instant AI transcription. Perfect for meetings, lectures, and personal notes.
                  </p>
                </div>

                <div className="relative">
                  {/* Recording Visualization Circle */}
                  <div className={cn(
                    "w-64 h-64 rounded-full flex items-center justify-center transition-all duration-500",
                    isRecording ? "bg-red-50 scale-110" : "bg-gray-50"
                  )}>
                    {isRecording && (
                      <motion.div 
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="absolute inset-0 border-4 border-red-200 rounded-full"
                      />
                    )}
                    <div className={cn(
                      "w-48 h-48 rounded-full flex flex-col items-center justify-center text-3xl font-mono",
                      isRecording ? "bg-red-600 text-white" : "bg-white border-2 border-gray-200"
                    )}>
                      {formatTime(recordingTime)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  {isRecording ? (
                    <>
                      <button 
                        onClick={togglePause}
                        className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
                      >
                        {isPaused ? <Play className="w-6 h-6 fill-current" /> : <Pause className="w-6 h-6 fill-current" />}
                      </button>
                      <button 
                        onClick={stopRecording}
                        className="w-20 h-20 rounded-full bg-black flex items-center justify-center hover:bg-gray-800 transition-colors shadow-xl"
                      >
                        <Square className="w-8 h-8 text-white fill-current" />
                      </button>
                    </>
                  ) : (
                    <button 
                      onClick={startRecording}
                      className="w-24 h-24 rounded-full bg-red-600 flex items-center justify-center hover:bg-red-700 transition-all shadow-xl hover:scale-105 active:scale-95"
                    >
                      <Mic className="w-10 h-10 text-white" />
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'history' && (
              <motion.div 
                key="history"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-full"
              >
                {/* Recordings List */}
                <div className="lg:col-span-1 space-y-4 overflow-y-auto pr-2">
                  <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
                    <History className="w-5 h-5" />
                    Recent Recordings
                  </h3>
                  {recordings.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-300 text-gray-400">
                      No recordings yet
                    </div>
                  ) : (
                    recordings.map(rec => (
                      <div 
                        key={rec.id}
                        onClick={() => setSelectedRecordingId(rec.id)}
                        className={cn(
                          "p-4 rounded-2xl border transition-all cursor-pointer group",
                          selectedRecordingId === rec.id 
                            ? "bg-white border-black shadow-md" 
                            : "bg-white border-gray-200 hover:border-gray-300"
                        )}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="font-semibold truncate pr-4">
                            {format(rec.timestamp, 'MMM d, h:mm a')}
                          </div>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteRecording(rec.id);
                            }}
                            className="text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-gray-500">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatTime(rec.duration)}
                          </div>
                          {rec.transcription && (
                            <div className="flex items-center gap-1 text-green-600">
                              <FileText className="w-3 h-3" />
                              Transcribed
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Recording Detail */}
                <div className="lg:col-span-2 bg-white rounded-3xl border border-gray-200 p-8 flex flex-col shadow-sm min-h-[500px]">
                  {selectedRecording ? (
                    <>
                      <div className="flex items-center justify-between mb-8">
                        <div>
                          <h4 className="text-2xl font-bold">Recording Details</h4>
                          <p className="text-gray-500">{format(selectedRecording.timestamp, 'PPPP p')}</p>
                        </div>
                        <button 
                          onClick={() => transcribeAudio(selectedRecording)}
                          disabled={selectedRecording.isTranscribing || !!selectedRecording.transcription}
                          className={cn(
                            "flex items-center gap-2 px-6 py-2.5 rounded-full font-semibold transition-all",
                            selectedRecording.transcription 
                              ? "bg-green-50 text-green-700 border border-green-200 cursor-default"
                              : "bg-black text-white hover:bg-gray-800 disabled:opacity-50"
                          )}
                        >
                          {selectedRecording.isTranscribing ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Transcribing...
                            </>
                          ) : selectedRecording.transcription ? (
                            <>
                              <FileText className="w-4 h-4" />
                              Transcribed
                            </>
                          ) : (
                            <>
                              <Volume2 className="w-4 h-4" />
                              Transcribe with AI
                            </>
                          )}
                        </button>
                      </div>

                      <div className="bg-gray-50 rounded-2xl p-4 mb-8">
                        <audio 
                          src={selectedRecording.url} 
                          controls 
                          className="w-full h-10"
                        />
                      </div>

                      <div className="flex-1 overflow-y-auto">
                        <h5 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4">Transcription</h5>
                        {selectedRecording.isTranscribing ? (
                          <div className="flex flex-col items-center justify-center h-40 space-y-4 text-gray-400">
                            <Loader2 className="w-8 h-8 animate-spin" />
                            <p>Gemini is processing your audio...</p>
                          </div>
                        ) : selectedRecording.transcription ? (
                          <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
                            <Markdown>{selectedRecording.transcription}</Markdown>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center h-40 text-gray-400 border-2 border-dashed border-gray-100 rounded-2xl">
                            <p>No transcription available yet</p>
                            <p className="text-xs">Click the button above to transcribe</p>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-4">
                      <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center">
                        <Play className="w-8 h-8" />
                      </div>
                      <p>Select a recording to view details and transcription</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'chat' && (
              <motion.div 
                key="chat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col h-full max-w-3xl mx-auto bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden"
              >
                {/* Chat Header */}
                <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center">
                      <MessageSquare className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold">AI Assistant</h3>
                      <p className="text-xs text-gray-500">Powered by Gemini 3.1 Pro</p>
                    </div>
                  </div>
                  {selectedRecording && (
                    <div className="text-xs px-3 py-1 bg-green-50 text-green-700 rounded-full border border-green-100">
                      Context: Current Recording
                    </div>
                  )}
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {chatMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-4 text-gray-400">
                      <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center">
                        <MessageSquare className="w-6 h-6" />
                      </div>
                      <div className="max-w-xs">
                        <p className="font-medium text-gray-600">Ask anything about your recordings</p>
                        <p className="text-sm">"Summarize the key points", "What was the main topic?", or "Translate this to Spanish"</p>
                      </div>
                    </div>
                  ) : (
                    chatMessages.map((msg, i) => (
                      <div 
                        key={i}
                        className={cn(
                          "flex",
                          msg.role === 'user' ? "justify-end" : "justify-start"
                        )}
                      >
                        <div className={cn(
                          "max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed",
                          msg.role === 'user' 
                            ? "bg-black text-white rounded-tr-none" 
                            : "bg-gray-100 text-gray-800 rounded-tl-none"
                        )}>
                          <Markdown>{msg.text}</Markdown>
                        </div>
                      </div>
                    ))
                  )}
                  {isChatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-gray-100 p-4 rounded-2xl rounded-tl-none">
                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Input */}
                <div className="p-6 border-t border-gray-100">
                  <form 
                    onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
                    className="relative"
                  >
                    <input 
                      type="text"
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      placeholder="Ask the AI about your recording..."
                      className="w-full pl-6 pr-14 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-black transition-all outline-none"
                    />
                    <button 
                      type="submit"
                      disabled={!userInput.trim() || isChatLoading}
                      className="absolute right-2 top-2 bottom-2 w-12 bg-black text-white rounded-xl flex items-center justify-center hover:bg-gray-800 disabled:opacity-50 transition-all"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </form>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

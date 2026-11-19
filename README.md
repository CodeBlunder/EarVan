# 🎧 Earvan – Smart Hearing Assistance  

> Transform your smartphone or laptop into a personalized smart hearing aid.

---

## Overview  

**Earvan** is a web-based smart hearing assistance application that converts any device with earphones into a customizable hearing aid system.  

Users can create personalized hearing profiles, and the application applies **real-time audio processing** with environment-based listening modes to enhance clarity, comfort, and safety.

---

## Features  

###  Personalized Hearing Profiles  
- Create and save custom hearing profiles  
- Fine-tune audio frequencies based on individual hearing needs  
- Profiles stored securely using MongoDB  

---

### Environment-Based Listening Modes  

Switch between intelligent sound modes depending on your surroundings:

-  **Quiet Mode** – Subtle amplification for silent environments  
-  **Conversation Mode** – Enhances speech clarity  
-  **Noisy/Street Mode** – Reduces background noise while preserving important sounds  

---

###  Real-Time Audio Processing  
-  Built using the Web Audio API  
-  Live gain control and frequency filtering  
-  Minimal latency for smooth listening experience  

---

###  Real-Time Live Captions (Speech-to-Text)  
- Browser-native Web Speech API integration (`SpeechRecognition`)  
- Transcribes nearby conversations into real-time scrolling captions alongside the audio stream  
- Real-time interim word updates and conversation history with timestamps  
- Accessibility font resizing, copy-to-clipboard, and full-screen expansion mode  

---

###  Safety First  
- Detects earphone / Bluetooth disconnection via `devicechange`  
- Automatically pauses audio processing immediately  
- Prevents loud feedback screeching or amplified noise from playing through speakers  
---

## Installation & Setup  

### Clone & Setup

```bash
git clone https://github.com/CodeBlunder/EarVan.git
cd EarVan

# Install Dependencies
npm install

# Configure Environment Variables
# Create .env from .env.example
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/earvan
# or MongoDB Atlas: mongodb+srv://<user>:<password>@cluster0.mongodb.net/earvan

# Run both the Backend Server (Express/MongoDB) & Frontend (Vite)
npm run dev:all

# Or run separately:
npm run server   # Starts Express API at http://localhost:5000
npm run dev      # Starts Vite React UI at http://localhost:3000
```

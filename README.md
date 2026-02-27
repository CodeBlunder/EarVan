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

###  Safety First  
-  Detects earphone disconnection  
-  Automatically pauses playback  
-  Prevents loud audio from playing through speakers  
---

## 📦 Installation & Setup  

### 1️⃣ Clone the Repository  

```bash
git clone https://github.com/your-username/earvan.git
cd earvan

# Install Dependencies

npm install

PORT=5000
MONGO_URI=your_mongodb_connection_string

npm run dev

npm run build
npm start

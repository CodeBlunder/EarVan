# 🎧 Earvan – Smart Hearing Assistance  

> Transform your smartphone or laptop into a personalized smart hearing aid.

---

## Overview  

**Earvan** is a web-based smart hearing assistance application that converts any device with earphones into a customizable hearing aid system.  

Users can create personalized hearing profiles, and the application applies **real-time audio processing** with environment-based listening modes to enhance clarity, comfort, and safety.

---

## Features  

### 🎧 Binaural Hearing Profiles & Pure-Tone Audiometry  
- Independent Left and Right ear calibration and EQ filter banks  
- Interactive 5-frequency pure-tone hearing test with stereo panning  
- Fine-tune ear balance (Left ⟷ Right) and frequency bands  
- Profiles stored securely using MongoDB  

---

### Environment-Based Listening Modes  

Switch between intelligent sound modes depending on your surroundings:

- **Quiet Mode** – Subtle amplification for silent environments  
- **Conversation Mode** – Enhances speech clarity  
- **Noisy/Street Mode** – Reduces background noise while preserving important sounds  

---

### ⚡ Real-Time Audio Processing  
- Built using the Web Audio API with dual channel splitting and merging  
- Live gain control, multi-band peaking filters, and dynamics compression  
- Minimal latency (~10ms) for smooth, natural listening experience  

---

### 🛡️ Safety First  
- Detects earphone / Bluetooth disconnection via `devicechange`  
- Automatically pauses audio processing immediately  
- Dynamics compressor limiter prevents loud feedback screeching or sudden high acoustic shocks  
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

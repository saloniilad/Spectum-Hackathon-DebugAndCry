# 🧥🧠 VibeFit – AI Virtual Try-On & Styling System

> A real-time AI-powered virtual try-on platform that creates a personalized 3D avatar from facial features and body metrics, enabling users to visualize outfits and get intelligent styling recommendations.

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-000000?style=for-the-badge&logo=three.js&logoColor=white)
![Groq](https://img.shields.io/badge/Groq-FF6B35?style=for-the-badge&logoColor=white)


---



## 🚀 Overview

**VibeFit** is an end-to-end AI fashion platform that simulates a real-world styling experience.

Users can:
- Scan their face 📸
- Input body metrics 📏
- Generate a personalized 3D avatar 🧍‍♀️
- Try on outfits virtually 👕
- Get AI-powered outfit ratings ⭐

The system combines computer vision, 3D rendering, and generative AI to deliver a highly interactive experience.

---

## ✨ Key Features

### 🧠 AI-Powered Avatar Creation
- Facial analysis using **MediaPipe FaceMesh**
- Extracts:
  - Skin tone
  - Face shape
  - Eye shape & spacing
- Generates a realistic avatar

---

### 👗 Virtual Try-On (3D)
- Built with **Three.js**
- Supports:
  - GLB clothing models
  - Dynamic scaling & positioning
  - Real-time outfit updates
- Smart fitting based on body proportions

---

### 📏 Size Recommendation System
- Uses:
  - Height & weight
  - BMI calculations
  - Body type classification
- Predicts best size (S/M/L)

---

### 🤖 AI Outfit Rating System
- Powered by **Groq (LLaMA 3.3)**
- Rates outfit based on:
  - Color harmony
  - Fit
  - Style coherence
- Provides:
  - Score (1–10)
  - Feedback
  - Improvement tips

---

### 🎨 Smart UI/UX
- Built using **React + TypeScript**
- Smooth animations via **Framer Motion**
- Multi-step onboarding flow:
  - Face scan → Body metrics → Avatar → Try-on

---

## 🏗️ Architecture

```
User Input (Face + Body Metrics)
        ↓
Facial Analysis (MediaPipe + AI)
        ↓
Avatar Generation (Three.js)
        ↓
Clothing Rendering (GLB Models)
        ↓
Outfit Selection UI
        ↓
AI Styling Engine (Groq API)
        ↓
Rating + Feedback + Recommendations
```

---

## 🛠️ Tech Stack

| Category        | Technologies               |
|-----------------|----------------------------|
| Frontend        | React.js, TypeScript       |
| 3D Rendering    | Three.js                   |
| Animation       | Framer Motion              |
| AI Models       | Groq API (LLaMA 3.3)       |
| Computer Vision | MediaPipe FaceMesh         |
| Styling Logic   | Custom ML logic            |

---





## ⚙️ Installation

### 1. Clone the repository
```bash
git clone https://github.com/saloniilad/Spectum-Hackathon-DebugAndCry
cd Spectum-Hackathon-DebugAndCry
```

### 2. Install dependencies
```bash
npm install
```

### 3. Setup environment variables

Create a `.env` file in the root directory:
```env
VITE_GROQ_API_KEY=your_api_key_here
```

### 4. Run the project
```bash
npm run dev
```

Open in browser:
```
http://localhost:5173
```

---

## 🔄 Workflow

1. Capture or upload face image
2. Extract facial features using AI
3. Input body metrics
4. Generate personalized avatar
5. Select outfits
6. Try-on in real-time
7. Get AI rating and suggestions

---

## 📁 Project Structure

```
src/
│
├── components/
│   ├── FaceCapture.tsx
│   ├── BodyMetrics.tsx
│   ├── AvatarViewer.tsx
│   ├── ClothingPanel.tsx
│   ├── OutfitBar.tsx
│   └── RateMyCombo.tsx
│
├── store/
│   └── AppStore.ts
│
├── utils/
│   ├── facialAnalysis.ts
│   └── faceLandmarks.ts
│
└── App.tsx
```

---

## 🚀 Future Enhancements

- 🧵 Cloth physics simulation
- 🛍️ Direct e-commerce integration
- 📱 Mobile app version
- 🌍 Multi-language support
- 🧠 Better personalization using ML

---

## ⚠️ Disclaimer

This project is for **educational and experimental purposes only**.
Not intended for real-world fashion or medical accuracy.

---

## 👩‍💻 Author

**Saloni Lad**
🎓 BTech Student | AI/ML Enthusiast

- GitHub: [https://github.com/saloniilad](https://github.com/saloniilad)




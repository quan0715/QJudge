# Frontend Development Guide

## 🛠 Prerequisites

- **Node.js**: 18 or higher
- **npm**: 9 or higher

## 🚀 Quick Start

### 1. Install Dependencies

Navigate to the frontend directory and install packages:

```bash
cd frontend
npm install
```

### 2. Configuration

Create a `.env` file in the `frontend` directory if needed.
Example variables:
- `VITE_API_BASE_URL=http://localhost:8000/api/v1`

### 3. Run Development Server

Start the Vite development server:

```bash
npm run dev
```

The application will be available at `http://localhost:5173`.

## 🏗 Build and Lint

### Build for Production

```bash
npm run build
```

The output will be in the `dist` directory.

### Lint Code

```bash
npm run lint
```

## 🧪 Testing

*Note: Frontend testing setup (e.g., Vitest/Jest) is currently pending implementation.*

## 📦 Project Structure

- `src/components/`: Reusable UI components (Carbon Design System)
- `src/pages/`: Page components
- `src/features/`: Redux slices and feature-specific logic
- `src/api/`: API client and endpoints
- `public/`: Static assets

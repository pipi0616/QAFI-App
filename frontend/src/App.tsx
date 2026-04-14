import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LangProvider } from "./i18n";
import Layout from "./components/Layout";
import Landing from "./pages/Landing";
import Interpret from "./pages/Interpret";
import Agent from "./pages/Agent";

function App() {
  return (
    <LangProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Landing />} />
            <Route path="/agent" element={<Agent />} />
            <Route path="/interpret" element={<Interpret />} />
            {/* Legacy route — redirect to Agent */}
            <Route path="/predict" element={<Navigate to="/agent" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </LangProvider>
  );
}

export default App;

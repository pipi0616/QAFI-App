import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LangProvider } from "./i18n";
import Layout from "./components/Layout";
import Landing from "./pages/Landing";
import Predict from "./pages/Predict";
import Interpret from "./pages/Interpret";
import Agent from "./pages/Agent";

function App() {
  return (
    <LangProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Landing />} />
            <Route path="/predict" element={<Predict />} />
            <Route path="/interpret" element={<Interpret />} />
            <Route path="/agent" element={<Agent />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </LangProvider>
  );
}

export default App;

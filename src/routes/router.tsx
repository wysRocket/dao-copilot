import { BrowserRouter, Routes, Route } from "react-router-dom"
import { HomePage } from "../pages/HomePage"
import { AboutPage } from "../pages/AboutPage"
import { ContactPage } from "../pages/ContactPage"
import { NotFoundPage } from "../pages/NotFoundPage"
import { EnhancedHomePage } from "../pages/EnhancedHomePage"

const AppRouter = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/enhanced" element={<EnhancedHomePage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  </BrowserRouter>
)

export default AppRouter

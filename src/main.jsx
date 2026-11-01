import { createRoot } from "react-dom/client";
import ScreenStudio from "./ScreenStudio";
import "./styles.css";

if (/^\/screens\/?$/.test(window.location.pathname)) {
  window.history.replaceState(
    null,
    "",
    `/${window.location.search}${window.location.hash}`,
  );
}

createRoot(document.getElementById("root")).render(<ScreenStudio />);

import { createRoot } from "react-dom/client";
import "../styles/primitives.css";
import "../styles.css";
import "./sheet-prototype.css";
import { SheetPrototype } from "./SheetPrototype";

const root = document.getElementById("root");
if (root === null) throw new Error("Prototype root was not found");
createRoot(root).render(<SheetPrototype />);

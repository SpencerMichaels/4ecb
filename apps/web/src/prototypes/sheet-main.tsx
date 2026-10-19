import { createRoot } from "react-dom/client";
import "../styles/primitives.css";
import "../styles/index.css";
import "../sheet-overview.css";
import { SheetPrototype } from "./SheetPrototype";

const root = document.getElementById("root");
if (root === null) throw new Error("Prototype root was not found");
createRoot(root).render(<SheetPrototype />);

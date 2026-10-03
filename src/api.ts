import { demo } from "./demo";
import { live } from "./firebase";
export const IS_DEMO = import.meta.env.VITE_DEMO_MODE === "true";
export const service = IS_DEMO ? demo : live;

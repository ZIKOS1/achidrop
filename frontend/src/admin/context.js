import { createContext, useContext } from "react";

export const AdminContext = createContext(null);
export const useApp = () => useContext(AdminContext);

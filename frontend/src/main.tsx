import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./context/AuthContext";
import "./styles.css";

const router = createBrowserRouter([
  { path: "*", element: <AuthProvider><App /></AuthProvider> }
], { future: { v7_relativeSplatPath: true } });

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);

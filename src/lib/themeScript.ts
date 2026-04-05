/**
 * Server-safe FOUC-prevention script generator.
 * This file has NO "use client" directive so it can be imported in Server Components.
 */

export function getThemeInitScript(role: "user" | "admin") {
  const storageKey = role === "admin" ? "theme-admin" : "theme-user";
  const darkTheme = role === "admin" ? "admin" : "user-dark";
  const lightTheme = role === "admin" ? "admin-light" : "user";
  const selector = role === "admin" ? "#admin-root" : "[data-theme]";

  return `(function(){try{var m=localStorage.getItem("${storageKey}")||"system";var d=m==="dark"||(m==="system"&&matchMedia("(prefers-color-scheme:dark)").matches);var t=d?"${darkTheme}":"${lightTheme}";var e=document.querySelector('${selector}');if(e)e.setAttribute("data-theme",t);}catch(e){}})();`;
}

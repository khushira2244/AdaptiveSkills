const TOKEN_KEY = "adaptive_skills_session";

export const sessionStore = {
  get: () => window.localStorage.getItem(TOKEN_KEY),
  set: (token: string) => window.localStorage.setItem(TOKEN_KEY, token),
  clear: () => window.localStorage.removeItem(TOKEN_KEY),
};

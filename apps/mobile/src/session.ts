import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "adaptive_skills_session";
export const sessionStore = {
  get: () => SecureStore.getItemAsync(TOKEN_KEY),
  set: (token: string) => SecureStore.setItemAsync(TOKEN_KEY, token),
  clear: () => SecureStore.deleteItemAsync(TOKEN_KEY),
};

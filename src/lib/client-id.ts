export function createClientId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    return [...bytes]
      .map((byte, index) => `${index === 4 || index === 6 || index === 8 || index === 10 ? "-" : ""}${byte.toString(16).padStart(2, "0")}`)
      .join("");
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

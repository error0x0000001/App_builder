/** Lowest possible UUIDv7 for a timestamp: lets `id >= floor` act as a time filter that uses the (workspace_id, id) index. */
export const uuidV7Floor = (ms) => {
  const hex = Math.max(0, Math.floor(ms)).toString(16).padStart(12, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8)}-7000-8000-000000000000`;
};

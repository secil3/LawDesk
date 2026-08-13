export const readResponse = async (response) => {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "İşlem tamamlanamadı");
  }

  return data;
};

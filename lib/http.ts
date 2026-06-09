export async function parseJsonResponse<T>(response: Response): Promise<{
  body: T | null;
  error: string | null;
}> {
  const text = await response.text();
  if (!text) {
    return {
      body: null,
      error: response.ok ? null : `Request failed with status ${response.status}.`
    };
  }

  try {
    return { body: JSON.parse(text) as T, error: null };
  } catch {
    return {
      body: null,
      error: response.ok ? "Unexpected response from server." : text.trim()
    };
  }
}

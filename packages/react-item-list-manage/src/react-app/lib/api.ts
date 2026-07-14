export async function fetchJson<T>(input: string) {
	return requestJson<T>(input);
}

export async function requestJson<T>(input: string, init?: RequestInit) {
	const response = await fetch(input, init);
	const payload = (await response.json()) as unknown;

	if (!response.ok) {
		const errorMessage =
			typeof payload === "object" &&
			payload !== null &&
			"error" in payload &&
			typeof payload.error === "string"
				? payload.error
				: `Request failed with status ${response.status}`;
		throw new Error(errorMessage);
	}

	return payload as T;
}

type ApiErrorResponse = {
  error?: string;
  message?: string;
  issues?: {
    formErrors?: string[];
    fieldErrors?: Record<string, string[] | undefined>;
  };
  errors?: unknown;
};

export function getApiErrorMessage(error: any, fallback: string): string {
  const data = error?.response?.data as ApiErrorResponse | undefined;

  if (typeof data?.error === "string" && data.error.trim()) {
    return data.error;
  }

  if (typeof data?.message === "string" && data.message.trim()) {
    return data.message;
  }

  const firstFormError = data?.issues?.formErrors?.find((item) => item?.trim());
  if (firstFormError) {
    return firstFormError;
  }

  const fieldErrors = data?.issues?.fieldErrors;
  if (fieldErrors && typeof fieldErrors === "object") {
    for (const fieldName of Object.keys(fieldErrors)) {
      const messages = fieldErrors[fieldName];
      if (Array.isArray(messages)) {
        const first = messages.find((item) => item?.trim());
        if (first) {
          return `${fieldName}: ${first}`;
        }
      }
    }
  }

  return fallback;
}

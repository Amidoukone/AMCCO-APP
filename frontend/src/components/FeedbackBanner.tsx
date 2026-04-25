type FeedbackBannerProps = {
  errorMessage?: string | null;
  successMessage?: string | null;
  isLoading?: boolean;
  loadingLabel?: string;
};

export function FeedbackBanner({
  errorMessage = null,
  successMessage = null,
  isLoading = false,
  loadingLabel = "Chargement en cours..."
}: FeedbackBannerProps): JSX.Element | null {
  if (!errorMessage && !successMessage && !isLoading) {
    return null;
  }

  return (
    <div className="feedback-banner-stack" aria-live="polite">
      {errorMessage ? (
        <p className="feedback-banner feedback-banner-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
      {successMessage ? (
        <p className="feedback-banner feedback-banner-success">
          {successMessage}
        </p>
      ) : null}
      {isLoading ? <p className="feedback-banner feedback-banner-loading">{loadingLabel}</p> : null}
    </div>
  );
}

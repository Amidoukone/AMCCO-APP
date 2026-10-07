import { useState } from "react";

type PageGuideItem = {
  term: string;
  description: string;
};

type PageGuideProps = {
  title: string;
  description: string;
  items: PageGuideItem[];
};

export function PageGuide({ title, description, items }: PageGuideProps): JSX.Element {
  const [isCompactScreen] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches
  );

  return (
    <details className="page-guide" aria-label={title} open={!isCompactScreen}>
      <summary className="page-guide-header">
        <span className="page-guide-heading">
          <h3>{title}</h3>
          <p>{description}</p>
        </span>
        <span className="page-guide-toggle" aria-hidden="true" />
      </summary>
      <dl className="page-guide-grid">
        {items.map((item) => (
          <div className="page-guide-item" key={item.term}>
            <dt>{item.term}</dt>
            <dd>{item.description}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

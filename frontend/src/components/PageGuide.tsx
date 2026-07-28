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
  return (
    <section className="page-guide" aria-label={title}>
      <div className="page-guide-header">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <dl className="page-guide-grid">
        {items.map((item) => (
          <div className="page-guide-item" key={item.term}>
            <dt>{item.term}</dt>
            <dd>{item.description}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

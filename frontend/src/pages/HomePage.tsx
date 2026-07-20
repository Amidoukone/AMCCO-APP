import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import agricultureHeroUrl from "../../images/all-images-tractor-plowing-field-sunset11.jpg";
import agricultureSectorUrl from "../../images/National-Mission-for-Sustainable-Agriculture.jpg";
import livestockSectorUrl from "../../images/images (7).jpg";
import fishSectorUrl from "../../images/0409-22407-pisciculture-le-cameroun-vise-une-augmentation-de-sa-production-de-10-000-tonnes-d-ici-2027_L.jpg";
import transportSectorUrl from "../../images/--Shacman-F3000-6x4-Dump-Truck--5---163422-092525.jpg";

const amccoLogoUrl = "/logo-amcco-web.jpg";
const CONTACT_PHONE = "79072440";
const CONTACT_PHONE_DISPLAY = "79 07 24 40";

const sectors = [
  {
    key: "agriculture",
    code: "AG",
    title: "Agriculture",
    image: agricultureSectorUrl,
    imageAlt: "Champ agricole cultivé",
    summary:
      "Accompagnement des campagnes, appui aux producteurs, suivi des intrants et valorisation des récoltes.",
    points: ["Intrants", "Campagnes", "Commercialisation"]
  },
  {
    key: "livestock",
    code: "EL",
    title: "Élevage",
    image: livestockSectorUrl,
    imageAlt: "Élevage bovin en exploitation",
    summary:
      "Organisation du suivi des troupeaux, approvisionnement, soins et circuits de vente responsables.",
    points: ["Nutrition", "Santé", "Vente"]
  },
  {
    key: "fish",
    code: "PI",
    title: "Pisciculture",
    image: fishSectorUrl,
    imageAlt: "Bassins modernes de pisciculture",
    summary:
      "Structuration des cycles de production, suivi des bassins, alimentation et mise en marché.",
    points: ["Bassins", "Aliment", "Récolte"]
  },
  {
    key: "transport",
    code: "TR",
    title: "Transport",
    image: transportSectorUrl,
    imageAlt: "Camion de transport de marchandises",
    summary:
      "Coordination logistique, acheminement des marchandises et continuité entre production et distribution.",
    points: ["Logistique", "Distribution", "Traçabilité"]
  }
];

const serviceLines = [
  "Courtage et mise en relation commerciale",
  "Conseil et orientation des opérateurs",
  "Approvisionnement et suivi des activités",
  "Pilotage opérationnel et financier"
];

export function HomePage(): JSX.Element {
  const { isAuthenticated } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const platformPath = isAuthenticated ? "/dashboard" : "/login";
  const platformLabel = isAuthenticated ? "Ouvrir la plateforme" : "Se connecter";

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  const closeMenu = (): void => setIsMenuOpen(false);

  return (
    <main className="home-page">
      <header className="home-nav">
        <Link className="home-brand" to="/" aria-label="Accueil AMCCO">
          <img src={amccoLogoUrl} alt="Logo AMCCO MBAG" />
          <span>
            <strong>AMCCO MBAG</strong>
            <small>Courtage, conseil et orientation</small>
          </span>
        </Link>
        <button
          type="button"
          className="home-menu-toggle"
          aria-label={isMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={isMenuOpen}
          aria-controls="home-mobile-menu"
          onClick={() => setIsMenuOpen((isOpen) => !isOpen)}
        >
          <span aria-hidden="true" />
        </button>
        <nav className="home-nav-links" aria-label="Navigation vitrine">
          <a href="#secteurs">Secteurs</a>
          <a href="#services">Services</a>
          <a href="#contact">Contact</a>
          <Link className="home-login-link" to={platformPath}>
            {platformLabel}
          </Link>
        </nav>
      </header>
      <div
        className={isMenuOpen ? "home-menu-backdrop is-open" : "home-menu-backdrop"}
        onClick={closeMenu}
        aria-hidden="true"
      />
      <aside
        id="home-mobile-menu"
        className={isMenuOpen ? "home-mobile-menu is-open" : "home-mobile-menu"}
        aria-label="Menu du site"
        aria-hidden={!isMenuOpen}
      >
        <div className="home-mobile-menu-header">
          <Link className="home-brand" to="/" aria-label="Accueil AMCCO" onClick={closeMenu}>
            <img src={amccoLogoUrl} alt="Logo AMCCO MBAG" />
            <span>
              <strong>AMCCO MBAG</strong>
              <small>Courtage, conseil et orientation</small>
            </span>
          </Link>
          <button
            type="button"
            className="home-menu-close"
            onClick={closeMenu}
            aria-label="Fermer le menu"
          >
            X
          </button>
        </div>
        <nav className="home-mobile-nav" aria-label="Navigation mobile vitrine">
          <a href="#secteurs" onClick={closeMenu}>
            <span>Secteurs</span>
            <strong>Domaines prioritaires</strong>
          </a>
          <a href="#services" onClick={closeMenu}>
            <span>Services</span>
            <strong>Courtage, conseil et pilotage</strong>
          </a>
          <a href="#contact" onClick={closeMenu}>
            <span>Contact</span>
            <strong>{CONTACT_PHONE_DISPLAY}</strong>
          </a>
        </nav>
        <div className="home-mobile-menu-actions">
          <Link className="home-mobile-primary" to={platformPath} onClick={closeMenu}>
            {platformLabel}
          </Link>
          <a className="home-mobile-secondary" href={`tel:${CONTACT_PHONE}`} onClick={closeMenu}>
            Appeler {CONTACT_PHONE_DISPLAY}
          </a>
        </div>
      </aside>

      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero-copy">
          <p className="home-eyebrow">Groupe Nioumala Diady</p>
          <h1 id="home-title">Développe les filières qui soutiennent le terrain.</h1>
          <p className="home-hero-text">
            Agriculture, élevage, pisciculture et transport: l'entreprise relie les besoins des
            opérateurs, les opportunités commerciales et le suivi opérationnel pour créer une
            croissance structurée.
          </p>
          <div className="home-hero-actions">
            <Link className="home-primary-action" to={platformPath}>
              {platformLabel}
            </Link>
            <a className="home-secondary-action" href={`tel:${CONTACT_PHONE}`}>
              Appeler {CONTACT_PHONE_DISPLAY}
            </a>
          </div>
        </div>

        <div className="home-hero-visual" aria-label="Identité AMCCO">
          <div className="home-hero-media">
            <img src={agricultureHeroUrl} alt="Tracteur préparant un champ agricole" />
            <div className="home-hero-media-overlay">
              <img src={amccoLogoUrl} alt="AMCCO MBAG" />
              <span>Présence multisectorielle</span>
            </div>
          </div>
        </div>
      </section>

      <section className="home-sector-preview" aria-label="Aperçu des secteurs">
        {sectors.map((sector) => (
          <a key={sector.key} href={`#${sector.key}`}>
            <span>{sector.code}</span>
            <strong>{sector.title}</strong>
          </a>
        ))}
      </section>

      <section id="secteurs" className="home-section home-sectors-section">
        <div className="home-section-heading">
          <p className="home-eyebrow">Secteurs prioritaires</p>
          <h2>Une présence structurée sur les chaînes de valeur essentielles.</h2>
        </div>
        <div className="home-sector-grid">
          {sectors.map((sector) => (
            <article
              key={sector.key}
              id={sector.key}
              className={`home-sector-card sector-${sector.key}`}
            >
              <div className="home-sector-image">
                <img src={sector.image} alt={sector.imageAlt} />
                <span>{sector.code}</span>
              </div>
              <div className="home-sector-content">
                <h3>{sector.title}</h3>
                <p>{sector.summary}</p>
                <div className="home-sector-tags">
                  {sector.points.map((point) => (
                    <span key={point}>{point}</span>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="services" className="home-section home-services-section">
        <div className="home-section-heading">
          <p className="home-eyebrow">Services</p>
          <h2>Un partenaire de terrain, de la décision à l'exécution.</h2>
        </div>
        <div className="home-services-layout">
          <div className="home-services-copy">
            <p>
              AMCCO combine connaissance locale, organisation commerciale et outils de pilotage pour
              sécuriser les opérations et améliorer la visibilité des activités.
            </p>
            <a className="home-contact-card" href={`tel:${CONTACT_PHONE}`}>
              <span>Contact direct</span>
              <strong>{CONTACT_PHONE_DISPLAY}</strong>
            </a>
          </div>
          <div className="home-service-list">
            {serviceLines.map((service) => (
              <div key={service} className="home-service-row">
                <span aria-hidden="true" />
                <strong>{service}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="contact" className="home-final-cta">
        <div>
          <p className="home-eyebrow">Espace sécurisé</p>
          <h2>Les collaborateurs peuvent accéder à la plateforme de gestion depuis ce site.</h2>
          <a className="home-phone-inline" href={`tel:${CONTACT_PHONE}`}>
            Contact entreprise: {CONTACT_PHONE_DISPLAY}
          </a>
        </div>
        <Link className="home-primary-action" to={platformPath}>
          {platformLabel}
        </Link>
      </section>
    </main>
  );
}

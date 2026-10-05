import { Link } from "@tanstack/react-router";
import logoImage from "@/assets/logo.png";

interface BrandHomeLinkProps {
  className?: string;
  imageClassName?: string;
}

export function BrandHomeLink({ className = "", imageClassName = "h-7 w-auto" }: BrandHomeLinkProps) {
  return (
    <Link
      to="/"
      aria-label="MyTransporter Startseite"
      className={`inline-flex min-h-11 shrink-0 items-center ${className}`}
    >
      <img src={logoImage} alt="MyTransporter" className={imageClassName} />
    </Link>
  );
}
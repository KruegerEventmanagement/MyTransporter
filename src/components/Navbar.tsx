import { useState } from "react";
import { LogIn, User, X, ChevronRight } from "lucide-react";

export function Navbar() {
  const [showModal, setShowModal] = useState<"login" | "register" | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [stayLoggedIn, setStayLoggedIn] = useState(false);
  const [userName, setUserName] = useState("");
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", password: "" });

  const handleLogin = () => {
    if (form.email && form.password) {
      setIsLoggedIn(true);
      setUserName(form.email.split("@")[0]);
      if (stayLoggedIn) {
        localStorage.setItem("mt_stay_logged_in", "true");
      }
      setShowModal(null);
      setForm({ firstName: "", lastName: "", email: "", phone: "", password: "" });
    }
  };

  const handleRegister = () => {
    if (form.firstName && form.lastName && form.email && form.password) {
      setIsLoggedIn(true);
      setUserName(form.firstName);
      setShowModal(null);
      setForm({ firstName: "", lastName: "", email: "", phone: "", password: "" });
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUserName("");
    setShowProfileMenu(false);
    localStorage.removeItem("mt_stay_logged_in");
  };

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 h-12 flex items-center justify-end gap-3">
          {!isLoggedIn ? (
            <>
              <button
                onClick={() => setShowModal("login")}
                className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Login
              </button>
              <button
                onClick={() => setShowModal("register")}
                className="text-xs font-medium px-3 py-1.5 rounded-full bg-secondary text-secondary-foreground border border-border hover:bg-muted transition-colors"
              >
                Registrieren
              </button>
            </>
          ) : (
            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-2 text-xs font-medium text-foreground hover:text-accent transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-accent/15 flex items-center justify-center">
                  <User className="w-3.5 h-3.5 text-accent" />
                </div>
                {userName}
              </button>
              {showProfileMenu && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-border rounded-xl shadow-lg p-2 animate-fade-in">
                  <p className="px-3 py-2 text-xs text-muted-foreground">Angemeldet als <span className="font-medium text-foreground">{userName}</span></p>
                  <hr className="border-border my-1" />
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-3 py-2 text-xs text-destructive hover:bg-destructive/5 rounded-lg transition-colors"
                  >
                    Abmelden
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </nav>

      {/* Modal Overlay */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card rounded-3xl border border-border shadow-2xl w-full max-w-sm p-6 animate-fade-in-up relative">
            <button
              onClick={() => setShowModal(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>

            <h3 className="text-xl font-bold text-foreground mb-1">
              {showModal === "login" ? "Willkommen zurück" : "Konto erstellen"}
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              {showModal === "login" ? "Melde dich an, um fortzufahren" : "Erstelle dein MyTransporter-Konto"}
            </p>

            <div className="space-y-3">
              {showModal === "register" && (
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    placeholder="Vorname"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  <input
                    type="text"
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                    placeholder="Nachname"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              )}
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="E-Mail"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              />
              {showModal === "register" && (
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="Telefonnummer"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                />
              )}
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Passwort"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              />

              {showModal === "login" && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={stayLoggedIn}
                    onChange={(e) => setStayLoggedIn(e.target.checked)}
                    className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                  />
                  <span className="text-xs text-muted-foreground">Angemeldet bleiben</span>
                </label>
              )}

              <button
                onClick={showModal === "login" ? handleLogin : handleRegister}
                className="w-full rounded-xl bg-accent py-2.5 text-accent-foreground font-medium text-sm transition-all hover:bg-accent/90 flex items-center justify-center gap-1"
              >
                {showModal === "login" ? "Einloggen" : "Registrieren"}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              {showModal === "login" ? (
                <>Noch kein Konto? <button onClick={() => setShowModal("register")} className="font-medium text-accent hover:underline">Registrieren</button></>
              ) : (
                <>Bereits registriert? <button onClick={() => setShowModal("login")} className="font-medium text-accent hover:underline">Einloggen</button></>
              )}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
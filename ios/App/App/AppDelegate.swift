import UIKit
import Capacitor
import LocalAuthentication

// MARK: - Native Biometric Lock Screen

private extension UIColor {
    /// `#rrggbb` — damit die Farbwerte hier Zeichen für Zeichen dieselben sind wie die Tokens in
    /// `src/app/globals.css`. Ein Umrechnen nach 0…1 von Hand wäre die Stelle, an der die beiden
    /// Seiten unbemerkt auseinanderlaufen.
    convenience init(hex: UInt32, alpha: CGFloat = 1) {
        self.init(red:   CGFloat((hex >> 16) & 0xff) / 255,
                  green: CGFloat((hex >>  8) & 0xff) / 255,
                  blue:  CGFloat( hex        & 0xff) / 255,
                  alpha: alpha)
    }
}

/// Die Farbwelt des Sperrbildschirms — dieselben drei wie in der App (`src/lib/theme.ts`).
///
/// Der Bildschirm liegt VOR der WebView und kann den Zustand nicht erfragen. Er liest ihn als
/// hinterlegten Wert, den die App beim letzten Lauf geschrieben hat (`src/lib/nativeWorld.ts`,
/// Capacitor Preferences → `UserDefaults`). Fehlt er, gilt `sub-open`: dieselbe Welt, die im Blatt
/// auf `:root` steht und die Bildschirme OHNE Zustand tragen — Anmeldung, Info. Der Sperrbildschirm
/// ist genau so einer, solange niemand angemeldet war.
private struct LockPalette {

    let background:  UIColor
    let surface:     UIColor
    let border:      UIColor
    let foreground:  UIColor
    let muted:       UIColor
    let faint:       UIColor
    let accent:      UIColor   // --btn-primary-bg: der Ton, den die Welt trägt
    let onAccent:    UIColor   // --btn-primary-text: was auf einer gefüllten Fläche lesbar ist
    let closed:      Bool      // verschlossen? entscheidet über das Zeichen, nicht über die Farbe

    static func current() -> LockPalette {
        switch UserDefaults.standard.string(forKey: "CapacitorStorage.world") {

        case "sub-locked":                       // Träger, verschlossen — Grün
            return LockPalette(background: UIColor(hex: 0x060907),
                               surface:    UIColor(hex: 0x0e130f),
                               border:     UIColor(hex: 0x2a302b),
                               foreground: UIColor(hex: 0xf5fbf7),
                               muted:      UIColor(hex: 0xb7c6bd),
                               faint:      UIColor(hex: 0x88958a),
                               accent:     UIColor(hex: 0x34d399),
                               onAccent:   UIColor(hex: 0x2b0410),
                               closed:     true)

        case "keyholder":                        // Keyholder-Bereich — Indigo
            return LockPalette(background: UIColor(hex: 0x070810),
                               surface:    UIColor(hex: 0x0f1119),
                               border:     UIColor(hex: 0x2c2e3a),
                               foreground: UIColor(hex: 0xf4f5fb),
                               muted:      UIColor(hex: 0xbcbed3),
                               faint:      UIColor(hex: 0x8c8ea6),
                               accent:     UIColor(hex: 0x8f88ff),
                               onAccent:   UIColor(hex: 0x2b0410),
                               closed:     true)

        default:                                 // "sub-open" und alles Unbekannte — die Rose
            return LockPalette(background: UIColor(hex: 0x0b0609),
                               surface:    UIColor(hex: 0x140d10),
                               border:     UIColor(hex: 0x332a2e),
                               foreground: UIColor(hex: 0xfdf7f8),
                               muted:      UIColor(hex: 0xc9b7bd),
                               faint:      UIColor(hex: 0x9a868e),
                               accent:     UIColor(hex: 0xff3d68),
                               onAccent:   UIColor(hex: 0x2b0410),
                               closed:     false)
        }
    }
}

private class LockScreenView: UIView {

    private let palette = LockPalette.current()

    private let glowLayer      = CAGradientLayer()
    private let iconView       = UIView()
    private let iconImage      = UIImageView()
    private let titleLabel     = UILabel()
    private let subtitleLabel  = UILabel()
    private(set) var unlockButton   = UIButton(type: .system)
    private(set) var passwordButton = UIButton(type: .system)

    override init(frame: CGRect) {
        super.init(frame: frame)
        setup()
    }
    required init?(coder: NSCoder) { fatalError() }

    private func setup() {
        backgroundColor = palette.background

        // Schein hinter dem Zeichen — dasselbe Mittel wie `--hero-glow` im Dashboard: der Ton der
        // Welt, weich auslaufend, auf 20 %. Er sitzt UNTER allem anderen als Layer, nicht als
        // View, damit er keine Berührung abfängt.
        glowLayer.type = .radial
        glowLayer.colors = [palette.accent.withAlphaComponent(0.20).cgColor,
                            palette.accent.withAlphaComponent(0).cgColor]
        glowLayer.locations = [0, 1]
        glowLayer.startPoint = CGPoint(x: 0.5, y: 0.5)
        glowLayer.endPoint   = CGPoint(x: 1, y: 1)
        layer.addSublayer(glowLayer)

        // Zeichen-Platte
        iconView.backgroundColor = palette.surface
        iconView.layer.cornerRadius = 28
        iconView.layer.cornerCurve = .continuous
        iconView.layer.borderWidth = 1
        iconView.layer.borderColor = palette.border.cgColor
        iconView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(iconView)

        // Das Schloss SAGT den Zustand: geschlossen oder offen, im Ton der Welt. Vorher war es
        // immer `lock.fill` in Weiss auf 45 % — dieselbe Auskunft für jeden Zustand, also keine.
        let cfg = UIImage.SymbolConfiguration(pointSize: 32, weight: .medium)
        iconImage.image = UIImage(systemName: palette.closed ? "lock.fill" : "lock.open.fill",
                                  withConfiguration: cfg)
        iconImage.tintColor = palette.accent
        iconImage.translatesAutoresizingMaskIntoConstraints = false
        iconView.addSubview(iconImage)

        // Beschriftung
        titleLabel.text = "ChastityTracker"
        titleLabel.font = .systemFont(ofSize: 22, weight: .bold)
        titleLabel.textColor = palette.foreground
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        addSubview(titleLabel)

        subtitleLabel.text = "Identität bestätigen um fortzufahren"
        subtitleLabel.font = .systemFont(ofSize: 14)
        subtitleLabel.textColor = palette.muted
        subtitleLabel.translatesAutoresizingMaskIntoConstraints = false
        addSubview(subtitleLabel)

        // Hauptknopf (Face ID / Geräte-Code) — gefüllte Bedeutungsfläche wie in der App, und die
        // Schrift darauf kommt deshalb aus `--btn-primary-text`, nicht aus Weiss.
        unlockButton.setTitle("Entsperren", for: .normal)
        unlockButton.setTitleColor(palette.onAccent, for: .normal)
        unlockButton.setTitleColor(palette.onAccent.withAlphaComponent(0.45), for: .disabled)
        unlockButton.titleLabel?.font = .systemFont(ofSize: 15, weight: .semibold)
        unlockButton.backgroundColor = palette.accent
        unlockButton.layer.cornerRadius = 14
        unlockButton.layer.cornerCurve = .continuous
        unlockButton.contentEdgeInsets = UIEdgeInsets(top: 14, left: 32, bottom: 14, right: 32)
        unlockButton.translatesAutoresizingMaskIntoConstraints = false
        addSubview(unlockButton)

        // Ausweichweg (Anmeldung mit Benutzername/Passwort)
        passwordButton.setTitle("Mit Passwort anmelden", for: .normal)
        passwordButton.setTitleColor(palette.faint, for: .normal)
        passwordButton.setTitleColor(palette.faint.withAlphaComponent(0.4), for: .highlighted)
        passwordButton.titleLabel?.font = .systemFont(ofSize: 14)
        passwordButton.translatesAutoresizingMaskIntoConstraints = false
        addSubview(passwordButton)

        NSLayoutConstraint.activate([
            iconView.centerXAnchor.constraint(equalTo: centerXAnchor),
            iconView.centerYAnchor.constraint(equalTo: centerYAnchor, constant: -100),
            iconView.widthAnchor.constraint(equalToConstant: 80),
            iconView.heightAnchor.constraint(equalToConstant: 80),

            iconImage.centerXAnchor.constraint(equalTo: iconView.centerXAnchor),
            iconImage.centerYAnchor.constraint(equalTo: iconView.centerYAnchor),

            titleLabel.topAnchor.constraint(equalTo: iconView.bottomAnchor, constant: 20),
            titleLabel.centerXAnchor.constraint(equalTo: centerXAnchor),

            subtitleLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 6),
            subtitleLabel.centerXAnchor.constraint(equalTo: centerXAnchor),

            unlockButton.topAnchor.constraint(equalTo: subtitleLabel.bottomAnchor, constant: 28),
            unlockButton.centerXAnchor.constraint(equalTo: centerXAnchor),

            passwordButton.topAnchor.constraint(equalTo: unlockButton.bottomAnchor, constant: 20),
            passwordButton.centerXAnchor.constraint(equalTo: centerXAnchor),
        ])
    }

    /// Der Schein folgt dem Zeichen. Er hängt an keinem Constraint (ein Layer kennt keine), also
    /// wird er hier nachgeführt — sonst sässe er nach einer Drehung neben dem Schloss.
    override func layoutSubviews() {
        super.layoutSubviews()
        let side: CGFloat = 460
        glowLayer.frame = CGRect(x: iconView.center.x - side / 2,
                                 y: iconView.center.y - side / 2,
                                 width: side, height: side)
    }

    func setLoading(_ loading: Bool) {
        unlockButton.isEnabled = !loading
        unlockButton.alpha = loading ? 0.4 : 1.0
    }
}

// MARK: - AppDelegate

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    private var lockView: LockScreenView?
    private var isAuthenticating = false
    private var biometryAvailable = false
    private var initialLockShown = false

    // MARK: - Lifecycle

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        checkBiometryAvailability()
        return true
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        guard biometryAvailable else { return }
        // Show on first launch — window is guaranteed ready here
        if !initialLockShown {
            initialLockShown = true
            showLockScreen()
            authenticate()
        }
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        guard biometryAvailable else { return }
        isAuthenticating = false
        showLockScreen()
    }

    // MARK: - Biometry

    private func checkBiometryAvailability() {
        let context = LAContext()
        var error: NSError?
        biometryAvailable = context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error)
    }

    private func showLockScreen() {
        guard lockView == nil, let window = window else { return }
        let view = LockScreenView(frame: window.bounds)
        view.unlockButton.addTarget(self, action: #selector(handleUnlockTap), for: .touchUpInside)
        view.passwordButton.addTarget(self, action: #selector(handlePasswordTap), for: .touchUpInside)
        window.addSubview(view)
        window.bringSubviewToFront(view)
        lockView = view
    }

    private func hideLockScreen() {
        UIView.animate(withDuration: 0.2, animations: {
            self.lockView?.alpha = 0
        }, completion: { _ in
            self.lockView?.removeFromSuperview()
            self.lockView = nil
        })
    }

    @objc private func handleUnlockTap() {
        authenticate()
    }

    /// Fallback: delete the NextAuth session cookie from the WKWebView cookie
    /// store (natively — no JS required, bypasses HttpOnly restriction), then
    /// navigate to the instance's /login page.
    ///
    /// We resolve the login URL from the WebView's current URL (Swift-side) so we
    /// always navigate to the *remote* instance, even if the shell (capacitor://localhost)
    /// is still loading. That way the instance selection stored in localStorage is
    /// never lost.
    @objc private func handlePasswordTap() {
        guard let bridgeVC = window?.rootViewController as? CAPBridgeViewController,
              let webView = bridgeVC.bridge?.webView else {
            hideLockScreen()
            return
        }

        // Resolve the login URL before starting the async cookie deletion.
        // If the WebView is already at the remote instance, use its origin.
        // If it is still at the Capacitor shell (capacitor://…), fall back to
        // reading ct_instance_url from localStorage via JS — the shell stores it there.
        let loginURL = resolveLoginURL(for: webView)

        let cookieStore = webView.configuration.websiteDataStore.httpCookieStore
        cookieStore.getAllCookies { [weak self] cookies in
            guard let self else { return }

            // NextAuth v4/v5 session cookie names (http and __Secure- variants)
            let sessionCookieNames: Set<String> = [
                "next-auth.session-token",
                "__Secure-next-auth.session-token",
                "authjs.session-token",
                "__Secure-authjs.session-token",
            ]
            let toDelete = cookies.filter { sessionCookieNames.contains($0.name) }

            let group = DispatchGroup()
            for cookie in toDelete {
                group.enter()
                cookieStore.delete(cookie) { group.leave() }
            }

            // Hide lock AFTER navigation starts — prevents a brief flash of the
            // dashboard before the /login page loads.
            group.notify(queue: .main) {
                if let absolute = loginURL {
                    // Direct navigation to the remote instance's login page — no shell involved.
                    webView.evaluateJavaScript(
                        "window.location.href = \(Self.jsString(absolute));",
                        completionHandler: nil)
                } else {
                    // Shell is still active: read the saved instance URL from localStorage
                    // and construct the login URL there so the instance is not forgotten.
                    webView.evaluateJavaScript("""
                        (function(){
                          var base = localStorage.getItem('ct_instance_url');
                          if (base) {
                            window.location.href = base.replace(/\\/$/, '') + '/login';
                          } else {
                            // No saved instance — show the setup shell.
                            window.location.href = '/';
                          }
                        })();
                    """, completionHandler: nil)
                }
                self.hideLockScreen()
            }
        }
    }

    /// Returns the absolute login URL when the WebView is already at a remote
    /// instance (scheme is https/http, not capacitor). Returns nil when the
    /// shell is still loading so the caller can use the localStorage fallback.
    private func resolveLoginURL(for webView: WKWebView) -> String? {
        guard let url = webView.url,
              let scheme = url.scheme, scheme != "capacitor",
              let host = url.host else { return nil }
        let port = url.port.map { ":\($0)" } ?? ""
        return "\(scheme)://\(host)\(port)/login"
    }

    /// JSON-encodes a Swift string so it is safe to interpolate into a JS string literal.
    private static func jsString(_ s: String) -> String {
        // JSONEncoder always produces valid JSON for strings.
        if let data = try? JSONEncoder().encode(s), let json = String(data: data, encoding: .utf8) {
            return json
        }
        // Fallback: manual escaping (backslash, double-quote, single-quote, newlines).
        let escaped = s
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
            .replacingOccurrences(of: "\n", with: "\\n")
        return "'\(escaped)'"
    }

    private func authenticate() {
        guard !isAuthenticating else { return }
        isAuthenticating = true
        lockView?.setLoading(true)

        // Fresh LAContext every call — avoids "Failed to change to usage state" errors.
        // .deviceOwnerAuthentication = Face ID first, then device passcode via system dialog.
        let context = LAContext()
        context.evaluatePolicy(.deviceOwnerAuthentication,
                                localizedReason: "Identität bestätigen") { [weak self] success, _ in
            DispatchQueue.main.async {
                guard let self else { return }
                self.isAuthenticating = false
                self.lockView?.setLoading(false)
                if success {
                    self.hideLockScreen()
                }
                // On cancel/failure: stay locked — user can tap Entsperren to retry
                // or tap Mit Passwort anmelden for the app login form.
            }
        }
    }

    // MARK: - Remote Notifications

    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func application(_ app: UIApplication, open url: URL,
                     options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity,
                     restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity,
                                                           restorationHandler: restorationHandler)
    }
}

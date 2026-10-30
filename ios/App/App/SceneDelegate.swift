import UIKit
import Capacitor
import GenCareNative

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        // GenCare's own screen: Capacitor's WebView plus the native plugins.
        window?.rootViewController = GenCareViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
        // Opened by a tap on a home-screen widget.
        connectionOptions.urlContexts.forEach { SceneDelegate.openWidgetLink($0.url) }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        let widgetLinks = URLContexts.filter { $0.url.scheme == "gencare" }
        widgetLinks.forEach { SceneDelegate.openWidgetLink($0.url) }
        let rest = URLContexts.subtracting(widgetLinks)
        if !rest.isEmpty { SceneDelegateProxy.shared.scene(scene, openURLContexts: rest) }
    }

    /// gencare://open?path=/calendar?date=2026-10-30 -> that page in the web app.
    static func openWidgetLink(_ url: URL) {
        guard url.scheme == "gencare",
              let path = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "path" })?.value
        else { return }
        NotifyBridge.openPath(path)
    }

    func sceneDidEnterBackground(_ scene: UIScene) {
        // Leaving the app: ask iOS for the next background calendar sync.
        BackgroundSync.schedule()
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

import UIKit
import Capacitor
import GenCareNative

/// The app's one screen: Capacitor's WebView showing gencare.base44.app, with
/// GenCare's own native plugins registered on it (Main.storyboard points here).
class GenCareViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(NotifyBridge())
        bridge?.registerPluginInstance(CalendarBridge())
        bridge?.registerPluginInstance(RecorderBridge())
        bridge?.registerPluginInstance(BillingBridge())
        bridge?.registerPluginInstance(WidgetBridge())
        NotificationCenter.default.addObserver(self, selector: #selector(snapshotSoon), name: UIApplication.willEnterForegroundNotification, object: nil)
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        snapshotSoon()
    }

    /// Copies the web app's sign-in for BackgroundSync (calendar sync with the app
    /// closed), a few times after each open, like Android's SessionSnapshotter.
    @objc private func snapshotSoon() {
        for delay in [3.0, 8.0, 20.0, 45.0] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in self?.snapshotSession() }
        }
    }

    private func snapshotSession() {
        let js = "(function(){try{return JSON.stringify({ready: document.readyState === 'complete' && location.protocol === 'https:', token: localStorage.getItem('base44_access_token'), appId: localStorage.getItem('base44_app_id'), serverUrl: localStorage.getItem('base44_app_base_url') || location.origin});}catch(e){return null;}})()"
        bridge?.webView?.evaluateJavaScript(js) { result, _ in
            guard let text = result as? String, let data = text.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  obj["ready"] as? Bool == true else { return }
            BackgroundSync.saveSession(token: obj["token"] as? String, appId: obj["appId"] as? String, serverUrl: obj["serverUrl"] as? String)
        }
    }
}

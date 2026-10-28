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
    }
}

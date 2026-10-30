import Foundation
import Capacitor
import Security
import WidgetKit

/// WidgetBridge — the web app's side of GenCare's home-screen widgets (Today,
/// This week, Month; the GenCareWidgets extension draws them). Same methods as
/// the Android WidgetBridge (src/lib/widgets.js):
///
///   status()                                    -> { hasKey, userId }
///   setKey({ key, userId, appId, serverUrl })   this phone's read-only widget key
///   reload()                                    the calendar changed: widgets refresh now
///   clear()                                     -> { key }   signing out: the widgets forget it all
///
/// The key lives in the keychain, in a group the widget extension shares
/// (keychain-access-groups in both entitlements files: "<team>.com.mediocreatbest.gencare.shared"),
/// readable after the phone's first unlock so widgets can refresh while it's locked.
@objc(WidgetBridge)
public class WidgetBridge: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridge"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setKey", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)
    ]

    static let service = "com.mediocreatbest.gencare.widget"
    static let account = "config"

    @objc func status(_ call: CAPPluginCall) {
        let cfg = WidgetBridge.readConfig()
        call.resolve(["hasKey": !((cfg?["key"] as? String) ?? "").isEmpty, "userId": (cfg?["userId"] as? String) ?? ""])
    }

    @objc func setKey(_ call: CAPPluginCall) {
        let key = call.getString("key") ?? ""
        let appId = call.getString("appId") ?? ""
        let serverUrl = call.getString("serverUrl") ?? ""
        guard !key.isEmpty, !appId.isEmpty, !serverUrl.isEmpty else {
            call.reject("key, appId and serverUrl are required")
            return
        }
        let cfg: [String: Any] = ["key": key, "userId": call.getString("userId") ?? "", "appId": appId, "serverUrl": serverUrl]
        guard WidgetBridge.writeConfig(cfg) else {
            call.reject("Could not save the widget key")
            return
        }
        WidgetBridge.reloadWidgets()
        call.resolve()
    }

    @objc func reload(_ call: CAPPluginCall) {
        WidgetBridge.reloadWidgets()
        call.resolve()
    }

    @objc func clear(_ call: CAPPluginCall) {
        let old = (WidgetBridge.readConfig()?["key"] as? String) ?? ""
        WidgetBridge.deleteConfig()
        WidgetBridge.reloadWidgets()
        call.resolve(old.isEmpty ? [:] : ["key": old])
    }

    static func reloadWidgets() {
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
    }

    // MARK: - Keychain

    /// "<team id>.com.mediocreatbest.gencare.shared". The team id is read off a
    /// throwaway keychain item (its access group starts with it), so nothing
    /// about the team is hard-coded.
    static func sharedGroup() -> String? {
        let probe: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "com.mediocreatbest.gencare.teamprobe",
            kSecAttrAccount as String: "probe",
            kSecReturnAttributes as String: true
        ]
        var result: CFTypeRef?
        var status = SecItemCopyMatching(probe as CFDictionary, &result)
        if status == errSecItemNotFound {
            var add = probe
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            status = SecItemAdd(add as CFDictionary, &result)
        }
        guard status == errSecSuccess,
              let attrs = result as? [String: Any],
              let group = attrs[kSecAttrAccessGroup as String] as? String,
              let team = group.split(separator: ".").first else { return nil }
        return "\(team).com.mediocreatbest.gencare.shared"
    }

    private static func baseQuery() -> [String: Any]? {
        guard let group = sharedGroup() else { return nil }
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessGroup as String: group
        ]
    }

    static func readConfig() -> [String: Any]? {
        guard var q = baseQuery() else { return nil }
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data,
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return obj
    }

    static func writeConfig(_ cfg: [String: Any]) -> Bool {
        guard let q = baseQuery(), let data = try? JSONSerialization.data(withJSONObject: cfg) else { return false }
        SecItemDelete(q as CFDictionary)
        var add = q
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
    }

    static func deleteConfig() {
        guard let q = baseQuery() else { return }
        SecItemDelete(q as CFDictionary)
    }
}

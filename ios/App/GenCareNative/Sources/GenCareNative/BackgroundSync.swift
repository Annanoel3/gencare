import Foundation
import BackgroundTasks
import CryptoKit
import Security
import WidgetKit

/// BackgroundSync — the iPhone's calendars and GenCare kept in step with the app
/// closed (Anna, Oct 30 2026: on iPhone it used to sync only when GenCare was
/// opened). The iPhone twin of Android's CalendarSyncWorker:
///
///   import: reads the calendars the person ticked (CalendarBridge.readRows) and,
///           when they changed (or once a day as a check-in), hands them to the
///           server's phoneCalendar function (mode "import").
///   export: asks the server for the family events this person wants on their
///           phone ("export_pull"), writes them into the calendar they chose
///           (CalendarBridge.writeRows), and reports back ("export_report").
///
/// It runs as a background app refresh task. iOS decides when: we ask for every
/// hour; it runs more often for apps people open a lot, less for ones they
/// don't, and not at all after the app is swiped closed until it's opened again.
/// It talks to the server with the app's own sign-in, copied out of the web app
/// on every open (GenCareViewController -> saveSession), kept in the keychain.
public enum BackgroundSync {
    public static let taskId = "com.mediocreatbest.gencare.calendar-sync"

    private static let defaults = UserDefaults.standard
    private static let kIds = "gencare.sync.calendarIds"
    private static let kExport = "gencare.sync.export"
    private static let kHash = "gencare.sync.lastHash"
    private static let kSentAt = "gencare.sync.lastSentAt"
    private static let kCount = "gencare.sync.lastCount"
    private static let kEmptySince = "gencare.sync.emptySince"
    private static let days = 365
    private static let resendAfter: TimeInterval = 24 * 3600
    private static let emptyHold: TimeInterval = 6 * 3600

    // MARK: - Settings from the app

    static func setCalendars(_ ids: [String]) {
        let clean = ids.map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        if clean != (defaults.stringArray(forKey: kIds) ?? []) {
            // A different set of calendars: what was sent before says nothing.
            defaults.removeObject(forKey: kHash)
            defaults.removeObject(forKey: kCount)
            defaults.removeObject(forKey: kEmptySince)
        }
        defaults.set(clean, forKey: kIds)
        schedule()
    }

    static func setExportEnabled(_ on: Bool) {
        defaults.set(on, forKey: kExport)
        schedule()
    }

    private static var calendarIds: [String] { defaults.stringArray(forKey: kIds) ?? [] }
    private static var exportOn: Bool { defaults.bool(forKey: kExport) }

    // MARK: - Scheduling

    /// From AppDelegate.didFinishLaunching (iOS requires it there).
    public static func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: taskId, using: nil) { task in
            guard let task = task as? BGAppRefreshTask else { task.setTaskCompleted(success: false); return }
            handle(task)
        }
    }

    /// Asks iOS for the next run (on leaving the app, and after each run).
    public static func schedule() {
        guard !calendarIds.isEmpty || exportOn else {
            BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: taskId)
            return
        }
        let req = BGAppRefreshTaskRequest(identifier: taskId)
        req.earliestBeginDate = Date(timeIntervalSinceNow: 60 * 60)
        do { try BGTaskScheduler.shared.submit(req) } catch { /* not allowed right now (Background App Refresh off): next open */ }
    }

    private static func handle(_ task: BGAppRefreshTask) {
        schedule()
        let work = Task {
            let ok = await run()
            task.setTaskCompleted(success: ok)
        }
        task.expirationHandler = { work.cancel() }
    }

    // MARK: - The run

    static func run() async -> Bool {
        guard let session = Session.load() else { return true } // signed out on this phone
        var ok = true
        if !calendarIds.isEmpty && CalendarBridge.fullAccess() {
            ok = await sendImport(session) && ok
        }
        if Task.isCancelled { return false }
        if exportOn && CalendarBridge.fullAccess() {
            ok = await sendExport(session) && ok
        }
        if #available(iOS 14.0, *) { WidgetCenter.shared.reloadAllTimelines() }
        return ok
    }

    private static func sendImport(_ session: Session) async -> Bool {
        let ids = calendarIds
        let rows = CalendarBridge.readRows(ids: Set(ids), days: days)
        let now = Date()
        // A calendar that suddenly reads empty is believed only after 6 hours
        // (a sync hiccup shouldn't take everyone's events away).
        if rows.isEmpty && defaults.object(forKey: kCount) as? Int != 0 {
            if let since = defaults.object(forKey: kEmptySince) as? Date {
                if now.timeIntervalSince(since) < emptyHold { return true }
            } else {
                defaults.set(now, forKey: kEmptySince)
                return true
            }
        } else {
            defaults.removeObject(forKey: kEmptySince)
        }
        let blob = (try? JSONSerialization.data(withJSONObject: ["ids": ids, "rows": rows], options: [.sortedKeys])) ?? Data()
        let hash = SHA256.hash(data: blob).map { String(format: "%02x", $0) }.joined()
        if hash == defaults.string(forKey: kHash), let sent = defaults.object(forKey: kSentAt) as? Date, now.timeIntervalSince(sent) < resendAfter {
            return true
        }
        let r = await session.phoneCalendar([
            "mode": "import", "source": "device", "calendarIds": ids, "rows": rows,
            "from": "phone_background", "timezone": TimeZone.current.identifier
        ])
        guard let body = r.body, r.code >= 200 && r.code < 300 else { return r.code == 401 || r.code == 403 }
        if body["in_progress"] as? Bool == true { return true }
        defaults.set(hash, forKey: kHash)
        defaults.set(now, forKey: kSentAt)
        defaults.set(rows.count, forKey: kCount)
        return true
    }

    private static func sendExport(_ session: Session) async -> Bool {
        let pull = await session.phoneCalendar(["mode": "export_pull", "from": "phone_background", "timezone": TimeZone.current.identifier])
        guard let plan = pull.body, pull.code >= 200 && pull.code < 300, plan["ok"] as? Bool == true else { return pull.code != 0 }
        let calendarId = (plan["calendarId"] as? String) ?? ""
        let events = (plan["events"] as? [Any] ?? []).compactMap { $0 as? [String: Any] }
        let deletes = (plan["deletes"] as? [Any] ?? []).compactMap { $0 as? String }
        if events.isEmpty && deletes.isEmpty { return true }
        var results: [[String: Any]] = []
        if !calendarId.isEmpty && !events.isEmpty {
            results = CalendarBridge.writeRows(calendarId: calendarId, events: events)
        }
        var deleted: [String] = []
        if !deletes.isEmpty {
            _ = CalendarBridge.deleteRows(deletes)
            deleted = deletes
        }
        var hashes: [String: Any] = [:]
        for e in events { if let k = e["key"] as? String { hashes[k] = e["hash"] ?? "" } }
        let rep = await session.phoneCalendar(["mode": "export_report", "results": results, "deleted": deleted, "hashes": hashes, "from": "phone_background"])
        return rep.code != 0
    }

    // MARK: - The app's sign-in

    /// Copied from the web app on every open (GenCareViewController). Signing out
    /// (no token in the web app any more) forgets it.
    public static func saveSession(token: String?, appId: String?, serverUrl: String?) {
        guard let token = token, !token.isEmpty, let appId = appId, !appId.isEmpty, let server = serverUrl, !server.isEmpty else {
            Session.clear()
            return
        }
        let had = Session.load()
        Session(token: token, appId: appId, serverUrl: server).save()
        // A fresh sign-in: send what's waiting at the next chance.
        if had?.token != token { schedule() }
    }

    struct Session {
        let token: String
        let appId: String
        let serverUrl: String

        private static let service = "com.mediocreatbest.gencare.session"
        private static func query() -> [String: Any] {
            [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "base44"]
        }

        static func load() -> Session? {
            var q = query()
            q[kSecReturnData as String] = true
            q[kSecMatchLimit as String] = kSecMatchLimitOne
            var result: CFTypeRef?
            guard SecItemCopyMatching(q as CFDictionary, &result) == errSecSuccess, let data = result as? Data,
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: String],
                  let t = obj["token"], let a = obj["appId"], let s = obj["serverUrl"] else { return nil }
            return Session(token: t, appId: a, serverUrl: s)
        }

        func save() {
            guard let data = try? JSONSerialization.data(withJSONObject: ["token": token, "appId": appId, "serverUrl": serverUrl]) else { return }
            SecItemDelete(Session.query() as CFDictionary)
            var add = Session.query()
            add[kSecValueData as String] = data
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            SecItemAdd(add as CFDictionary, nil)
        }

        static func clear() { SecItemDelete(query() as CFDictionary) }

        /// POST {server}/api/apps/{app}/functions/phoneCalendar as the person.
        func phoneCalendar(_ body: [String: Any]) async -> (code: Int, body: [String: Any]?) {
            var server = serverUrl
            if server.hasSuffix("/") { server.removeLast() }
            guard let url = URL(string: "\(server)/api/apps/\(appId)/functions/phoneCalendar"),
                  let payload = try? JSONSerialization.data(withJSONObject: body) else { return (0, nil) }
            var req = URLRequest(url: url, timeoutInterval: 25)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.setValue("application/json", forHTTPHeaderField: "Accept")
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            req.setValue(appId, forHTTPHeaderField: "X-App-Id")
            req.httpBody = payload
            do {
                let (data, response) = try await URLSession.shared.data(for: req)
                let code = (response as? HTTPURLResponse)?.statusCode ?? 0
                return (code, (try? JSONSerialization.jsonObject(with: data)) as? [String: Any])
            } catch {
                return (0, nil)
            }
        }
    }
}

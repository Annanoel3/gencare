import WidgetKit
import SwiftUI
import UIKit
import Security
import AppIntents

// GenCare's home-screen widgets for iPhone: Today, This week and Month (Anna,
// Oct 30 2026). Twins of the Android widgets (WidgetRender.java). They refresh
// on their own about every 30 minutes (iOS decides exactly when) from the
// server's widgetFeed function, with a read-only key the app saved in the
// shared keychain group (WidgetBridge.swift), and the app asks them to refresh
// whenever the calendar changes there. Care events carry their color, the rest
// are plain text, only-you events are gray: the same as the calendar in the app.
// A tap opens the app on that day (gencare://open?path=..., SceneDelegate).

// MARK: - Data

struct WEvent: Codable, Hashable {
    var id = ""
    var t = ""      // title
    var s = ""      // start "HH:MM", "" when all day
    var e = ""      // end
    var a = false   // all day
    var c = ""      // "#hex" color, "" = plain text (not care-related)
    var p = false   // only this person sees it
    var w = ""      // who it's for, or whose it is
    var n = ""      // "Day 2 of 3"

    enum CodingKeys: String, CodingKey { case id, t, s, e, a, c, p, w, n }

    init(id: String, t: String, s: String = "", e: String = "", a: Bool = false, c: String = "", p: Bool = false, w: String = "", n: String = "") {
        self.id = id; self.t = t; self.s = s; self.e = e; self.a = a; self.c = c; self.p = p; self.w = w; self.n = n
    }

    init(from decoder: Decoder) throws {
        let k = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? k.decode(String.self, forKey: .id)) ?? ""
        t = (try? k.decode(String.self, forKey: .t)) ?? ""
        s = (try? k.decode(String.self, forKey: .s)) ?? ""
        e = (try? k.decode(String.self, forKey: .e)) ?? ""
        a = (try? k.decode(Bool.self, forKey: .a)) ?? false
        c = (try? k.decode(String.self, forKey: .c)) ?? ""
        p = (try? k.decode(Bool.self, forKey: .p)) ?? false
        w = (try? k.decode(String.self, forKey: .w)) ?? ""
        n = (try? k.decode(String.self, forKey: .n)) ?? ""
    }
}

struct Feed: Codable {
    var days: [String: [WEvent]] = [:]
    func on(_ day: Date) -> [WEvent] { days[Days.key(day)] ?? [] }
}

enum FeedState { case ok, signedOut, noAccess, loading }

// MARK: - Days (Sunday-first weeks, like the app)

enum Days {
    static var cal: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.firstWeekday = 1
        c.timeZone = .current
        return c
    }
    static func key(_ d: Date) -> String {
        let f = DateFormatter()
        f.calendar = cal
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: d)
    }
    static func text(_ d: Date, _ format: String) -> String {
        let f = DateFormatter()
        f.calendar = cal
        f.timeZone = .current
        f.setLocalizedDateFormatFromTemplate(format)
        return f.string(from: d)
    }
    static func start(_ d: Date) -> Date { cal.startOfDay(for: d) }
    static func add(_ d: Date, _ n: Int) -> Date { cal.date(byAdding: .day, value: n, to: d) ?? d }
    static func weekStart(_ d: Date) -> Date {
        let day = start(d)
        return add(day, -(cal.component(.weekday, from: day) - 1))
    }
    static func monthStart(_ d: Date) -> Date {
        cal.date(from: cal.dateComponents([.year, .month], from: d)) ?? start(d)
    }
    /// The Sunday on or before the 1st: the Month widget's first square.
    static func gridStart(_ d: Date) -> Date { weekStart(monthStart(d)) }
    static func same(_ a: Date, _ b: Date) -> Bool { cal.isDate(a, inSameDayAs: b) }
    static func sameMonth(_ a: Date, _ b: Date) -> Bool {
        cal.component(.month, from: a) == cal.component(.month, from: b) && cal.component(.year, from: a) == cal.component(.year, from: b)
    }
    static func dayNumber(_ d: Date) -> String { String(cal.component(.day, from: d)) }

    /// "9:00 AM" (or "09:00" when the phone uses 24-hour time) from "HH:MM".
    static func clock(_ hhmm: String) -> String {
        let parts = hhmm.split(separator: ":").compactMap { Int($0) }
        guard parts.count >= 1 else { return "" }
        // Today's date with that time (a bare time would land in year 1, whose
        // old local-mean-time offsets can shift the minutes).
        var comps = cal.dateComponents([.year, .month, .day], from: Date())
        comps.hour = parts[0]
        comps.minute = parts.count > 1 ? parts[1] : 0
        guard let date = cal.date(from: comps) else { return hhmm }
        let f = DateFormatter()
        f.timeStyle = .short
        f.dateStyle = .none
        return f.string(from: date)
    }
}

// MARK: - Key and fetching

enum FeedLoader {
    /// changedAt: when the app last said the calendar changed (or set the key), so
    /// a saved feed from before that isn't reused.
    struct Config { let key: String; let appId: String; let serverUrl: String; let changedAt: Double }

    enum KeyRead { case found(Config), missing, unreadable }

    private static let keyQuery: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "com.mediocreatbest.gencare.widget",
        kSecAttrAccount as String: "config"
    ]

    /// The app's widget key (shared keychain group; this extension's only group, so no group needed in the query).
    /// Before the phone's first unlock after a restart the keychain can't be read
    /// at all: that's "unreadable", not "signed out".
    static func readKey() -> KeyRead {
        var q = keyQuery
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &result)
        if status == errSecItemNotFound { return .missing }
        guard status == errSecSuccess,
              let data = result as? Data,
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let key = obj["key"] as? String, !key.isEmpty,
              let app = obj["appId"] as? String, !app.isEmpty,
              let server = obj["serverUrl"] as? String, !server.isEmpty else { return status == errSecSuccess ? .missing : .unreadable }
        return .found(Config(key: key, appId: app, serverUrl: server, changedAt: (obj["changedAt"] as? Double) ?? 0))
    }

    /// The server no longer knows this key (it keeps a few per person): drop it,
    /// so the app gets a new one the next time it opens. Not one the app just wrote.
    static func dropKey(_ rejected: String) {
        if case .found(let now) = readKey(), now.key == rejected { SecItemDelete(keyQuery as CFDictionary) }
    }

    private static var cacheURL: URL? {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?.appendingPathComponent("gencare-widget-feed.json")
    }

    static func cached() -> (Feed, Date)? {
        guard let url = cacheURL, let data = try? Data(contentsOf: url),
              let feed = try? JSONDecoder().decode(Feed.self, from: data) else { return nil }
        let at = (try? FileManager.default.attributesOfItem(atPath: url.path)[.modificationDate] as? Date) ?? .distantPast
        return (feed, at)
    }

    private static func save(_ feed: Feed) {
        guard let url = cacheURL, let data = try? JSONEncoder().encode(feed) else { return }
        try? data.write(to: url, options: .atomic)
    }

    static func clearCache() {
        if let url = cacheURL { try? FileManager.default.removeItem(at: url) }
    }

    /// The six weeks the Month widget can show (they always hold this week, today and tomorrow).
    static func load(now: Date = Date()) async -> (Feed?, FeedState) {
        let cfg: Config
        switch readKey() {
        case .found(let c): cfg = c
        case .missing:
            clearCache()
            return (nil, .signedOut)
        case .unreadable:
            if let saved = cached() { return (saved.0, .ok) }
            return (nil, .loading)
        }
        // All three widgets ask at about the same time; one fetch serves them,
        // unless the calendar changed in the app since it was saved.
        if let saved = cached(), now.timeIntervalSince(saved.1) < 5 * 60, saved.1.timeIntervalSince1970 > cfg.changedAt { return (saved.0, .ok) }
        let from = Days.gridStart(now)
        var to = Days.add(from, 41)
        let tomorrow = Days.add(Days.start(now), 1)
        if tomorrow > to { to = tomorrow }
        var server = cfg.serverUrl
        if server.hasSuffix("/") { server.removeLast() }
        guard let url = URL(string: "\(server)/api/apps/\(cfg.appId)/functions/widgetFeed") else {
            if let saved = cached() { return (saved.0, .ok) }
            return (nil, .loading)
        }
        var req = URLRequest(url: url, timeoutInterval: 20)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.setValue(cfg.appId, forHTTPHeaderField: "X-App-Id")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["key": cfg.key, "from": Days.key(from), "to": Days.key(to)])
        do {
            let (data, response) = try await URLSession.shared.data(for: req)
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            let error = obj?["error"] as? String
            if code == 401 || error == "no_key" { clearCache(); dropKey(cfg.key); return (nil, .signedOut) }
            if error == "no_access" { return (nil, .noAccess) }
            if code >= 200 && code < 300, obj?["ok"] as? Bool == true {
                let feed = (try? JSONDecoder().decode(Feed.self, from: data)) ?? Feed()
                save(feed)
                return (feed, .ok)
            }
        } catch {
            // No network: what was saved last.
        }
        if let saved = cached() { return (saved.0, .ok) }
        return (nil, .loading)
    }
}

// MARK: - Timeline

struct DayEntry: TimelineEntry {
    let date: Date
    let feed: Feed?
    let state: FeedState
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> DayEntry { DayEntry(date: Date(), feed: Sample.feed, state: .ok) }

    func getSnapshot(in context: Context, completion: @escaping (DayEntry) -> Void) {
        if context.isPreview {
            completion(DayEntry(date: Date(), feed: Sample.feed, state: .ok))
            return
        }
        Task {
            let (feed, state) = await FeedLoader.load()
            completion(DayEntry(date: Date(), feed: feed, state: state))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<DayEntry>) -> Void) {
        Task {
            let now = Date()
            let (feed, state) = await FeedLoader.load(now: now)
            // A second entry at midnight so the day turns over on time even if
            // the next refresh is late.
            let midnight = Days.add(Days.start(now), 1)
            let entries = [DayEntry(date: now, feed: feed, state: state), DayEntry(date: midnight, feed: feed, state: state)]
            completion(Timeline(entries: entries, policy: .after(now.addingTimeInterval(30 * 60))))
        }
    }
}

/// Generic events for the widget gallery preview (never anyone's real calendar).
enum Sample {
    static var feed: Feed {
        let today = Days.start(Date())
        var f = Feed()
        f.days[Days.key(today)] = [
            WEvent(id: "1", t: "Dentist", s: "09:30", e: "10:30", c: "#3b82f6", w: "Grandma"),
            WEvent(id: "2", t: "Pick up prescription", s: "13:00", c: "#10b981", w: "Dad"),
            WEvent(id: "3", t: "Book club", s: "19:00")
        ]
        f.days[Days.key(Days.add(today, 1))] = [WEvent(id: "4", t: "Physical therapy", s: "11:00", c: "#a855f7", w: "Mom")]
        f.days[Days.key(Days.add(today, 3))] = [WEvent(id: "5", t: "Soccer practice", s: "17:00")]
        return f
    }
}

// MARK: - Look

extension Color {
    static func dyn(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(rgb: dark) : UIColor(rgb: light) })
    }
    static let wBg = dyn(0xFFFFFF, 0x181D20)
    static let wFg = dyn(0x21282C, 0xF4F3F0)
    static let wMuted = dyn(0x67777E, 0x989081)
    static let wFaint = dyn(0xB4BCC0, 0x5A5F61)
    static let wPrimary = dyn(0x4B9B75, 0x53AC82)
    static let wToday = dyn(0xEAF4EF, 0x1F2E28)
    static let wButton = dyn(0xF1F0EC, 0x242A2D)

    /// An event's color, or nil for plain text.
    static func event(_ hex: String) -> Color? {
        let h = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        guard h.count == 6, let v = UInt32(h, radix: 16) else { return nil }
        return Color(UIColor(rgb: v))
    }
}

extension UIColor {
    convenience init(rgb: UInt32) {
        self.init(red: CGFloat((rgb >> 16) & 0xFF) / 255, green: CGFloat((rgb >> 8) & 0xFF) / 255, blue: CGFloat(rgb & 0xFF) / 255, alpha: 1)
    }
}

func link(_ path: String) -> URL {
    // The whole page as one value, its "&" and "=" encoded too: URLComponents
    // leaves those as they are, and the app (SceneDelegate) would then only get
    // the part before the first "&" (losing "&event=…" or "&log=…").
    var allowed = CharacterSet.alphanumerics
    allowed.insert(charactersIn: "-._~/")
    let value = path.addingPercentEncoding(withAllowedCharacters: allowed) ?? path
    return URL(string: "gencare://open?path=\(value)") ?? URL(string: "gencare://open")!
}
func dayLink(_ d: Date) -> URL { link("/calendar?date=\(Days.key(d))") }

extension View {
    /// iOS 17+ draws the widget's background itself (and its margins); before that, we do.
    @ViewBuilder func widgetCard() -> some View {
        if #available(iOS 17.0, *) {
            self.containerBackground(for: .widget) { Color.wBg }
        } else {
            self.padding(14).background(Color.wBg)
        }
    }
}

struct Logo: View {
    var body: some View {
        RoundedRectangle(cornerRadius: 5)
            .fill(Color.wPrimary)
            .frame(width: 18, height: 18)
            .overlay(Image(systemName: "heart.fill").font(.system(size: 9, weight: .bold)).foregroundColor(.white))
    }
}

struct Header: View {
    let title: String
    let subtitle: String
    var body: some View {
        HStack(spacing: 6) {
            Logo()
            Text(title).font(.system(size: 14, weight: .bold)).foregroundColor(.wFg).lineLimit(1)
            Text(subtitle).font(.system(size: 12)).foregroundColor(.wMuted).lineLimit(1)
            Spacer(minLength: 0)
        }
    }
}

struct Notice: View {
    let state: FeedState
    var body: some View {
        VStack {
            Spacer(minLength: 0)
            Text(state == .loading ? "Loading…" : state == .noAccess ? "Open GenCare to see your family calendar." : "Open GenCare to see your family calendar here.")
                .font(.system(size: 13)).foregroundColor(.wMuted).multilineTextAlignment(.center)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity)
    }
}

/// An event with its color bar (care events), time and who.
struct EventRow: View {
    let ev: WEvent
    var titleSize: CGFloat = 13
    var body: some View {
        HStack(alignment: .top, spacing: 7) {
            RoundedRectangle(cornerRadius: 2)
                .fill(Color.event(ev.c) ?? Color.clear)
                .frame(width: 3)
            VStack(alignment: .leading, spacing: 1) {
                Text(ev.t).font(.system(size: titleSize, weight: .medium)).foregroundColor(.wFg).lineLimit(1)
                Text(meta).font(.system(size: titleSize - 2)).foregroundColor(.wMuted).lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .fixedSize(horizontal: false, vertical: true)
    }
    var meta: String {
        var parts: [String] = []
        if ev.a { parts.append("All day") } else {
            parts.append(ev.e.isEmpty ? Days.clock(ev.s) : "\(Days.clock(ev.s)) – \(Days.clock(ev.e))")
        }
        if !ev.w.isEmpty { parts.append(ev.w) }
        if !ev.n.isEmpty { parts.append(ev.n) }
        if ev.p { parts.append("Only you") }
        return parts.joined(separator: " · ")
    }
}

// MARK: - Today

struct TodayView: View {
    @Environment(\.widgetFamily) var family
    let entry: DayEntry

    var body: some View {
        let today = Days.start(entry.date)
        let tomorrow = Days.add(today, 1)
        VStack(alignment: .leading, spacing: 8) {
            Header(title: "Today", subtitle: Days.text(today, family == .systemSmall ? "MMMd" : "EEEMMMd"))
            if let feed = entry.feed, entry.state == .ok {
                if family == .systemMedium {
                    HStack(alignment: .top, spacing: 12) {
                        DayList(day: today, events: feed.on(today), limit: 3, empty: "Nothing on the calendar today.")
                        DayList(day: tomorrow, events: feed.on(tomorrow), limit: 2, empty: "Nothing yet.", label: "Tomorrow")
                    }
                } else if family == .systemLarge {
                    DayList(day: today, events: feed.on(today), limit: 6, empty: "Nothing on the calendar today.")
                    Divider()
                    DayList(day: tomorrow, events: feed.on(tomorrow), limit: 3, empty: "Nothing yet.", label: "Tomorrow · " + Days.text(tomorrow, "EEEMMMd"))
                } else {
                    DayList(day: today, events: feed.on(today), limit: 3, empty: "Nothing on the calendar today.")
                }
                Spacer(minLength: 0)
            } else {
                Notice(state: entry.state)
            }
        }
        .widgetURL(dayLink(today))
        .widgetCard()
    }
}

struct DayList: View {
    @Environment(\.widgetFamily) var family
    let day: Date
    let events: [WEvent]
    let limit: Int
    let empty: String
    var label: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let label = label {
                Text(label).font(.system(size: 11, weight: .semibold)).foregroundColor(.wMuted).lineLimit(1)
            }
            if events.isEmpty {
                Text(empty).font(.system(size: 12)).foregroundColor(.wMuted)
            }
            ForEach(events.prefix(limit), id: \.self) { ev in
                if family == .systemSmall {
                    EventRow(ev: ev, titleSize: 12)
                } else {
                    Link(destination: link("/calendar?date=\(Days.key(day))&event=\(ev.id)")) { EventRow(ev: ev) }
                }
            }
            if events.count > limit {
                Text("+\(events.count - limit) more").font(.system(size: 11)).foregroundColor(.wMuted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - This week

struct WeekView: View {
    @Environment(\.widgetFamily) var family
    let entry: DayEntry

    var body: some View {
        let start = Days.weekStart(entry.date)
        let end = Days.add(start, 6)
        let days = (0..<7).map { Days.add(start, $0) }
        VStack(alignment: .leading, spacing: 6) {
            Header(title: "This week", subtitle: Days.text(start, "MMMd") + " – " + Days.text(end, Days.sameMonth(start, end) ? "d" : "MMMd"))
            if let feed = entry.feed, entry.state == .ok {
                if family == .systemLarge {
                    VStack(spacing: 0) {
                        ForEach(days, id: \.self) { d in
                            Link(destination: dayLink(d)) { WeekRow(day: d, events: feed.on(d), today: entry.date) }
                            if d != end { Divider().opacity(0.5) }
                        }
                    }
                } else {
                    HStack(alignment: .top, spacing: 3) {
                        ForEach(days, id: \.self) { d in
                            Link(destination: dayLink(d)) { WeekColumn(day: d, events: feed.on(d), today: entry.date) }
                        }
                    }
                }
                Spacer(minLength: 0)
            } else {
                Notice(state: entry.state)
            }
        }
        .widgetURL(dayLink(entry.date))
        .widgetCard()
    }
}

/// Large: one row per day, the day on the left (like the app's Week view).
struct WeekRow: View {
    let day: Date
    let events: [WEvent]
    let today: Date
    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            VStack(spacing: 0) {
                Text(Days.text(day, "EEE")).font(.system(size: 10)).foregroundColor(.wMuted)
                DayNumber(day: day, today: today, size: 22, font: 12)
            }
            .frame(width: 32)
            VStack(alignment: .leading, spacing: 2) {
                if events.isEmpty {
                    Text("No events").font(.system(size: 11)).foregroundColor(.wFaint)
                }
                ForEach(events.prefix(2), id: \.self) { ev in
                    HStack(spacing: 5) {
                        RoundedRectangle(cornerRadius: 1.5).fill(Color.event(ev.c) ?? Color.clear).frame(width: 3, height: 12)
                        Text((ev.a ? "" : Days.clock(ev.s) + "  ") + ev.t).font(.system(size: 11)).foregroundColor(.wFg).lineLimit(1)
                    }
                }
                if events.count > 2 {
                    Text("+\(events.count - 2) more").font(.system(size: 10)).foregroundColor(.wMuted)
                }
            }
            Spacer(minLength: 0)
        }
        .frame(maxHeight: .infinity)
    }
}

/// Medium: seven narrow columns.
struct WeekColumn: View {
    let day: Date
    let events: [WEvent]
    let today: Date
    var body: some View {
        VStack(spacing: 2) {
            Text(Days.text(day, "EEEEE")).font(.system(size: 9)).foregroundColor(.wMuted)
            DayNumber(day: day, today: today, size: 20, font: 11)
            ForEach(events.prefix(3), id: \.self) { ev in Chip(ev: ev, dim: false) }
            if events.count > 3 {
                Text("+\(events.count - 3)").font(.system(size: 8)).foregroundColor(.wMuted)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.vertical, 2)
        .background(Days.same(day, today) ? Color.wToday : Color.clear)
        .cornerRadius(6)
    }
}

struct DayNumber: View {
    let day: Date
    let today: Date
    var size: CGFloat = 18
    var font: CGFloat = 10
    var faint = false
    var body: some View {
        let isToday = Days.same(day, today)
        Text(Days.dayNumber(day))
            .font(.system(size: font, weight: isToday ? .bold : .regular))
            .foregroundColor(isToday ? .white : faint ? .wFaint : .wFg)
            .frame(width: size, height: size)
            .background(Circle().fill(isToday ? Color.wPrimary : Color.clear))
    }
}

/// A tiny event in the Week (medium) and Month widgets: colored for care, plain otherwise.
struct Chip: View {
    let ev: WEvent
    let dim: Bool
    var body: some View {
        let color = Color.event(ev.c)
        Text(ev.t)
            .font(.system(size: 8, weight: color == nil ? .regular : .medium))
            .foregroundColor(color == nil ? (dim ? .wFaint : .wFg) : .white)
            .lineLimit(1)
            .padding(.horizontal, 2)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 2).fill(color.map { $0.opacity(dim ? 0.5 : 1) } ?? Color.clear))
    }
}

// MARK: - Month

struct MonthView: View {
    let entry: DayEntry

    var body: some View {
        let start = Days.gridStart(entry.date)
        let monthOf = entry.date
        // Five rows when the month fits (six when it doesn't; four for some Februaries).
        let rows = (0..<6).filter { r in r < 4 || Days.sameMonth(Days.add(start, r * 7), monthOf) }
        VStack(spacing: 4) {
            Header(title: Days.text(monthOf, "MMMMyyyy"), subtitle: "")
            HStack(spacing: 0) {
                ForEach(0..<7, id: \.self) { i in
                    Text(["S", "M", "T", "W", "T", "F", "S"][i]).font(.system(size: 9)).foregroundColor(.wMuted).frame(maxWidth: .infinity)
                }
            }
            if let feed = entry.feed, entry.state == .ok {
                VStack(spacing: 2) {
                    ForEach(rows, id: \.self) { r in
                        HStack(spacing: 2) {
                            ForEach(0..<7, id: \.self) { c in
                                let d = Days.add(start, r * 7 + c)
                                Link(destination: dayLink(d)) {
                                    MonthCell(day: d, events: feed.on(d), today: entry.date, inMonth: Days.sameMonth(d, monthOf))
                                }
                            }
                        }
                    }
                }
            } else {
                Notice(state: entry.state)
            }
        }
        .widgetURL(dayLink(entry.date))
        .widgetCard()
    }
}

struct MonthCell: View {
    let day: Date
    let events: [WEvent]
    let today: Date
    let inMonth: Bool
    var body: some View {
        VStack(spacing: 1) {
            DayNumber(day: day, today: today, size: 16, font: 10, faint: !inMonth)
            ForEach(events.prefix(2), id: \.self) { ev in Chip(ev: ev, dim: !inMonth) }
            if events.count > 2 {
                Text("+\(events.count - 2)").font(.system(size: 7)).foregroundColor(.wMuted)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Days.same(day, today) ? Color.wToday : Color.clear)
        .cornerRadius(5)
    }
}

// MARK: - The widgets

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "GenCareToday", provider: Provider()) { TodayView(entry: $0) }
            .configurationDisplayName("Today")
            .description("Today's family calendar, and tomorrow's.")
            .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct WeekWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "GenCareWeek", provider: Provider()) { WeekView(entry: $0) }
            .configurationDisplayName("This week")
            .description("The family calendar for this week.")
            .supportedFamilies([.systemMedium, .systemLarge])
    }
}

struct MonthWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "GenCareMonth", provider: Provider()) { MonthView(entry: $0) }
            .configurationDisplayName("Month")
            .description("The family calendar for the whole month.")
            .supportedFamilies([.systemLarge])
    }
}

@main
struct GenCareWidgets: WidgetBundle {
    var body: some Widget {
        TodayWidget()
        WeekWidget()
        MonthWidget()
        CareWidget()
    }
}

// MARK: - Care Log (Anna, Nov 10 2026: "a log widget. It should work for any
// type of care and be sorted accordingly by the app")
//
// Twin of the Android Care Log widget (CareWidget.java, CareRender.java). The
// server (widgetFeed, mode "care") sends everyone the family takes care of, a
// line or two about their latest, and their Care Log buttons in the order the
// family uses them (base44/shared/careQuick.ts). On iOS 17 and later a button
// logs right on the widget, as you, with Undo for two minutes; one that needs
// details (how much, what happened) opens the app on its form, and so does
// every button before iOS 17 (the app logs it when it opens). The name at the
// top switches to the next person.

struct CareLine: Codable, Hashable {
    var i = ""      // icon
    var t = ""      // what: "Bottle · 4 oz"
    var at = ""     // when (ISO)
    var by = ""     // who logged it
    var now = false // going now (asleep, nursing): "since"

    enum CodingKeys: String, CodingKey { case i, t, at, by, now }

    init(i: String, t: String, at: String = "", by: String = "", now: Bool = false) {
        self.i = i; self.t = t; self.at = at; self.by = by; self.now = now
    }

    init(from decoder: Decoder) throws {
        let k = try decoder.container(keyedBy: CodingKeys.self)
        i = (try? k.decode(String.self, forKey: .i)) ?? ""
        t = (try? k.decode(String.self, forKey: .t)) ?? ""
        at = (try? k.decode(String.self, forKey: .at)) ?? ""
        by = (try? k.decode(String.self, forKey: .by)) ?? ""
        now = (try? k.decode(Bool.self, forKey: .now)) ?? false
    }
}

struct CareButton: Codable, Hashable {
    var k = ""      // which button
    var i = ""      // icon
    var l = ""      // label
    var a = false   // needs details: opens the app

    enum CodingKeys: String, CodingKey { case k, i, l, a }

    init(k: String, i: String, l: String, a: Bool = false) {
        self.k = k; self.i = i; self.l = l; self.a = a
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        k = (try? c.decode(String.self, forKey: .k)) ?? ""
        i = (try? c.decode(String.self, forKey: .i)) ?? ""
        l = (try? c.decode(String.self, forKey: .l)) ?? ""
        a = (try? c.decode(Bool.self, forKey: .a)) ?? false
    }
}

struct CarePerson: Codable, Hashable {
    var id = ""
    var n = ""      // first name
    var b = ""      // age band
    var s: [CareLine] = []
    var q: [CareButton] = []

    enum CodingKeys: String, CodingKey { case id, n, b, s, q }

    init(id: String, n: String, b: String = "", s: [CareLine] = [], q: [CareButton] = []) {
        self.id = id; self.n = n; self.b = b; self.s = s; self.q = q
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(String.self, forKey: .id)) ?? ""
        n = (try? c.decode(String.self, forKey: .n)) ?? ""
        b = (try? c.decode(String.self, forKey: .b)) ?? ""
        s = (try? c.decode([CareLine].self, forKey: .s)) ?? []
        q = (try? c.decode([CareButton].self, forKey: .q)) ?? []
    }
}

struct CareFeed: Codable {
    var people: [CarePerson] = []
}

/// The note about the last tap on the widget ("Wet diaper logged · Undo").
struct CareNote {
    let state: String   // "ok", "already", "error", "undone", "undo_error"
    let member: String
    let icon: String
    let label: String
    let id: String
    let loggedAt: String
    let at: Date
}

enum CareLoader {
    private static let personKey = "gencare.care.person"
    private static let noteKey = "gencare.care.note"

    private static var cacheURL: URL? {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?.appendingPathComponent("gencare-widget-care.json")
    }

    static func cached() -> (CareFeed, Date)? {
        guard let url = cacheURL, let data = try? Data(contentsOf: url),
              let feed = try? JSONDecoder().decode(CareFeed.self, from: data) else { return nil }
        let at = (try? FileManager.default.attributesOfItem(atPath: url.path)[.modificationDate] as? Date) ?? .distantPast
        return (feed, at)
    }

    private static func save(_ feed: CareFeed) {
        guard let url = cacheURL, let data = try? JSONEncoder().encode(feed) else { return }
        try? data.write(to: url, options: .atomic)
    }

    static func clearCache() {
        if let url = cacheURL { try? FileManager.default.removeItem(at: url) }
    }

    /// Posts to widgetFeed with the widget key and saves the people it answers with.
    static func call(_ body: [String: Any]) async -> ([String: Any]?, FeedState) {
        let cfg: FeedLoader.Config
        switch FeedLoader.readKey() {
        case .found(let c): cfg = c
        case .missing:
            clearCache()
            return (nil, .signedOut)
        case .unreadable:
            return (nil, .loading)
        }
        var server = cfg.serverUrl
        if server.hasSuffix("/") { server.removeLast() }
        guard let url = URL(string: "\(server)/api/apps/\(cfg.appId)/functions/widgetFeed") else { return (nil, .loading) }
        var req = URLRequest(url: url, timeoutInterval: 20)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.setValue(cfg.appId, forHTTPHeaderField: "X-App-Id")
        var payload = body
        payload["key"] = cfg.key
        req.httpBody = try? JSONSerialization.data(withJSONObject: payload)
        do {
            let (data, response) = try await URLSession.shared.data(for: req)
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            let error = obj?["error"] as? String
            if code == 401 || error == "no_key" {
                clearCache()
                FeedLoader.clearCache()
                FeedLoader.dropKey(cfg.key)
                return (nil, .signedOut)
            }
            if error == "no_access" { return (nil, .noAccess) }
            if code >= 200 && code < 300, obj?["ok"] as? Bool == true {
                if let people = obj?["people"],
                   let raw = try? JSONSerialization.data(withJSONObject: ["people": people]),
                   let feed = try? JSONDecoder().decode(CareFeed.self, from: raw) {
                    save(feed)
                }
                return (obj, .ok)
            }
        } catch {
            // No network: what was saved last.
        }
        return (nil, .loading)
    }

    /// The people and their buttons: saved in the last minute (after a tap, or
    /// since the app last changed something), or fresh from the server.
    static func load(now: Date = Date()) async -> (CareFeed?, FeedState) {
        if case .found(let cfg) = FeedLoader.readKey(), let saved = cached(),
           now.timeIntervalSince(saved.1) < 60, saved.1.timeIntervalSince1970 > cfg.changedAt {
            return (saved.0, .ok)
        }
        let (_, state) = await call(["mode": "care"])
        if state == .signedOut || state == .noAccess { return (nil, state) }
        if let saved = cached() { return (saved.0, .ok) }
        return (nil, state)
    }

    static func log(member: String, button: String, icon: String, label: String) async {
        let (obj, _) = await call(["mode": "log", "member_id": member, "button": button])
        if let obj = obj {
            setNote(state: (obj["already"] as? Bool) == true ? "already" : "ok", member: member,
                    icon: (obj["i"] as? String) ?? icon, label: (obj["l"] as? String) ?? label,
                    id: (obj["id"] as? String) ?? "", loggedAt: (obj["at"] as? String) ?? "")
        } else {
            setNote(state: "error", member: member, icon: icon, label: label, id: "", loggedAt: "")
        }
    }

    static func unlog(id: String, member: String, icon: String, label: String) async {
        let (obj, _) = await call(["mode": "unlog", "id": id])
        setNote(state: obj != nil ? "undone" : "undo_error", member: member, icon: icon, label: label, id: obj != nil ? "" : id, loggedAt: "")
    }

    static func setNote(state: String, member: String, icon: String, label: String, id: String, loggedAt: String) {
        let note: [String: Any] = ["state": state, "member": member, "i": icon, "l": label, "id": id, "loggedAt": loggedAt, "at": Date().timeIntervalSince1970]
        UserDefaults.standard.set(note, forKey: noteKey)
    }

    /// The note, for two minutes after the tap.
    static func note(now: Date = Date()) -> CareNote? {
        guard let d = UserDefaults.standard.dictionary(forKey: noteKey) else { return nil }
        let at = Date(timeIntervalSince1970: (d["at"] as? Double) ?? 0)
        let age = now.timeIntervalSince(at)
        guard age >= 0, age < 120 else { return nil }
        return CareNote(state: (d["state"] as? String) ?? "", member: (d["member"] as? String) ?? "",
                        icon: (d["i"] as? String) ?? "", label: (d["l"] as? String) ?? "",
                        id: (d["id"] as? String) ?? "", loggedAt: (d["loggedAt"] as? String) ?? "", at: at)
    }

    /// The person the widget shows (the first one until someone switches).
    static func personFor(_ feed: CareFeed) -> CarePerson? {
        let want = UserDefaults.standard.string(forKey: personKey) ?? ""
        return feed.people.first(where: { $0.id == want }) ?? feed.people.first
    }

    static func next(_ feed: CareFeed) {
        guard feed.people.count > 1 else { return }
        let now = personFor(feed)?.id ?? ""
        let at = feed.people.firstIndex(where: { $0.id == now }) ?? 0
        UserDefaults.standard.set(feed.people[(at + 1) % feed.people.count].id, forKey: personKey)
    }
}

// MARK: Care Log taps (iOS 17: they run right on the widget)

@available(iOS 17.0, *)
struct CareLogIntent: AppIntent {
    static let title: LocalizedStringResource = "Log care"
    static let isDiscoverable = false

    @Parameter(title: "Person") var member: String
    @Parameter(title: "Button") var button: String
    @Parameter(title: "Icon") var icon: String
    @Parameter(title: "Label") var label: String

    init() {}

    init(member: String, button: String, icon: String, label: String) {
        self.member = member
        self.button = button
        self.icon = icon
        self.label = label
    }

    func perform() async throws -> some IntentResult {
        await CareLoader.log(member: member, button: button, icon: icon, label: label)
        return .result()
    }
}

@available(iOS 17.0, *)
struct CareUndoIntent: AppIntent {
    static let title: LocalizedStringResource = "Take back a care log entry"
    static let isDiscoverable = false

    @Parameter(title: "Entry") var id: String
    @Parameter(title: "Person") var member: String
    @Parameter(title: "Icon") var icon: String
    @Parameter(title: "Label") var label: String

    init() {}

    init(id: String, member: String, icon: String, label: String) {
        self.id = id
        self.member = member
        self.icon = icon
        self.label = label
    }

    func perform() async throws -> some IntentResult {
        await CareLoader.unlog(id: id, member: member, icon: icon, label: label)
        return .result()
    }
}

@available(iOS 17.0, *)
struct CareNextIntent: AppIntent {
    static let title: LocalizedStringResource = "Next person"
    static let isDiscoverable = false

    init() {}

    func perform() async throws -> some IntentResult {
        if let saved = CareLoader.cached() { CareLoader.next(saved.0) }
        return .result()
    }
}

// MARK: Care Log timeline

struct CareEntry: TimelineEntry {
    let date: Date
    let feed: CareFeed?
    let state: FeedState
    let person: CarePerson?
    let note: CareNote?
}

struct CareProvider: TimelineProvider {
    func placeholder(in context: Context) -> CareEntry {
        CareEntry(date: Date(), feed: CareSample.feed, state: .ok, person: CareSample.feed.people.first, note: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (CareEntry) -> Void) {
        if context.isPreview {
            completion(placeholder(in: context))
            return
        }
        Task { completion(await CareProvider.entry(now: Date())) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CareEntry>) -> Void) {
        Task {
            let now = Date()
            let first = await CareProvider.entry(now: now)
            var entries = [first]
            // The note about the last tap goes away after two minutes.
            if let note = first.note {
                let end = note.at.addingTimeInterval(120)
                if end > now { entries.append(CareEntry(date: end, feed: first.feed, state: first.state, person: first.person, note: nil)) }
            }
            completion(Timeline(entries: entries, policy: .after(now.addingTimeInterval(30 * 60))))
        }
    }

    static func entry(now: Date) async -> CareEntry {
        let (feed, state) = await CareLoader.load(now: now)
        let person = feed.flatMap { CareLoader.personFor($0) }
        var note = CareLoader.note(now: now)
        if note?.member != person?.id { note = nil }
        return CareEntry(date: now, feed: feed, state: state, person: person, note: note)
    }
}

/// Generic people for the widget gallery preview (never anyone's real family).
enum CareSample {
    static var feed: CareFeed {
        let ago = { (m: Double) in ISO8601DateFormatter().string(from: Date().addingTimeInterval(-m * 60)) }
        return CareFeed(people: [
            CarePerson(id: "1", n: "Grandma", b: "senior",
                       s: [CareLine(i: "🥪", t: "Lunch", at: ago(40)), CareLine(i: "🚶", t: "Walk", at: ago(150))],
                       q: [CareButton(k: "walk", i: "🚶", l: "Walk"), CareButton(k: "dinner", i: "🍽️", l: "Dinner"),
                           CareButton(k: "shower", i: "🚿", l: "Shower"), CareButton(k: "good", i: "😊", l: "Good day"),
                           CareButton(k: "hard", i: "😔", l: "Hard day"), CareButton(k: "visit", i: "👋", l: "Visit"),
                           CareButton(k: "exercises", i: "💪", l: "Exercises"), CareButton(k: "fall", i: "⚠️", l: "Fall", a: true),
                           CareButton(k: "note", i: "📝", l: "Note", a: true)])
        ])
    }
}

// MARK: Care Log look

enum CareText {
    static func date(_ iso: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: iso) { return d }
        f.formatOptions = [.withInternetDateTime]
        if let d = f.date(from: iso) { return d }
        // No zone: the server's own times are UTC.
        let g = DateFormatter()
        g.locale = Locale(identifier: "en_US_POSIX")
        g.timeZone = TimeZone(identifier: "UTC")
        g.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
        return g.date(from: String(iso.prefix(19)))
    }

    /// "2:14 PM" today, "Yesterday 9:10 PM", else "Nov 8".
    static func when(_ iso: String, now: Date) -> String {
        guard let d = date(iso) else { return "" }
        let clock = DateFormatter()
        clock.timeStyle = .short
        clock.dateStyle = .none
        if Days.same(d, now) { return clock.string(from: d) }
        if Days.same(d, Days.add(now, -1)) { return "Yesterday " + clock.string(from: d) }
        return Days.text(d, "MMMd")
    }

    /// "🍼 Bottle · 4 oz · 2:14 PM · David", or "😴 Asleep since 2:10 PM".
    static func line(_ s: CareLine, now: Date) -> String {
        var out = "\(s.i) \(s.t)"
        let w = when(s.at, now: now)
        if !w.isEmpty { out += (s.now ? " since " : " · ") + w }
        if !s.by.isEmpty { out += " · \(s.by)" }
        return out
    }

    static func note(_ n: CareNote, name: String, now: Date) -> String {
        switch n.state {
        case "ok": return "✓ \(n.icon) \(n.label) logged for \(name)"
        case "already":
            let at = when(n.loggedAt, now: now)
            return "✓ \(n.label) was already logged" + (at.isEmpty ? " today" : " at \(at)")
        case "undone": return "Taken back: \(n.label)"
        case "undo_error": return "Couldn't take it back. Open GenCare to delete it."
        default: return "Couldn't log \(n.label). Check your connection and try again."
        }
    }
}

struct CareNoticeText: View {
    let entry: CareEntry
    var body: some View {
        let text: String = {
            switch entry.state {
            case .signedOut: return "Open GenCare to log care from here."
            case .noAccess: return "Open GenCare to log care."
            case .loading: return "Loading…"
            case .ok: return "No one to log for yet. Open GenCare and, on the profile of the person the family takes care of, turn on the care switch."
            }
        }()
        VStack {
            Spacer(minLength: 0)
            Text(text).font(.system(size: 12)).foregroundColor(.wMuted).multilineTextAlignment(.center)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity)
    }
}

struct CareName: View {
    let name: String
    let more: Bool
    var body: some View {
        Text(name + (more ? "  ›" : ""))
            .font(.system(size: 13, weight: .bold))
            .foregroundColor(.wPrimary)
            .lineLimit(1)
    }
}

struct CareHeader: View {
    let entry: CareEntry
    var body: some View {
        HStack(spacing: 6) {
            Logo()
            Text("Care Log").font(.system(size: 14, weight: .bold)).foregroundColor(.wFg).lineLimit(1)
            Spacer(minLength: 4)
            if let p = entry.person {
                if (entry.feed?.people.count ?? 0) > 1 {
                    if #available(iOS 17.0, *) {
                        Button(intent: CareNextIntent()) { CareName(name: p.n, more: true) }
                            .buttonStyle(.plain)
                    } else {
                        CareName(name: p.n, more: false)
                    }
                } else {
                    CareName(name: p.n, more: false)
                }
            }
        }
    }
}

struct CareNoteRow: View {
    let note: CareNote
    let name: String
    let now: Date
    var body: some View {
        HStack(spacing: 6) {
            Text(CareText.note(note, name: name, now: now))
                .font(.system(size: 11))
                .foregroundColor(.wFg)
                .lineLimit(1)
            Spacer(minLength: 4)
            if note.state == "ok" && !note.id.isEmpty {
                if #available(iOS 17.0, *) {
                    Button(intent: CareUndoIntent(id: note.id, member: note.member, icon: note.icon, label: note.label)) {
                        Text("Undo").font(.system(size: 12, weight: .bold)).foregroundColor(.wPrimary)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(RoundedRectangle(cornerRadius: 8).fill(Color.wToday))
    }
}

struct CareButtonView: View {
    let person: CarePerson
    let button: CareButton

    var body: some View {
        if button.a {
            // Needs details (how much, what happened): the app, on that form.
            Link(destination: link("/care-log?for=\(person.id)&log=\(button.k)")) { face }
        } else {
            if #available(iOS 17.0, *) {
                Button(intent: CareLogIntent(member: person.id, button: button.k, icon: button.i, label: button.l)) { face }
                    .buttonStyle(.plain)
            } else {
                // Before iOS 17 a widget can't run it: the app logs it when it opens.
                Link(destination: link("/care-log?for=\(person.id)&log=\(button.k)")) { face }
            }
        }
    }

    var face: some View {
        VStack(spacing: 1) {
            Text(button.i).font(.system(size: 17))
            Text(button.l)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(.wFg)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color.wButton))
    }
}

struct CareGrid: View {
    let person: CarePerson
    let rows: Int
    let cols: Int

    var body: some View {
        let shown = Array(person.q.prefix(rows * cols))
        let used = max(1, min(rows, (shown.count + cols - 1) / cols))
        VStack(spacing: 4) {
            ForEach(0..<used, id: \.self) { r in
                HStack(spacing: 4) {
                    ForEach(0..<cols, id: \.self) { c in
                        if r * cols + c < shown.count {
                            CareButtonView(person: person, button: shown[r * cols + c])
                        } else {
                            Color.clear.frame(maxWidth: .infinity, maxHeight: .infinity)
                        }
                    }
                }
            }
        }
    }
}

struct CareView: View {
    @Environment(\.widgetFamily) var family
    let entry: CareEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            CareHeader(entry: entry)
            if let p = entry.person, entry.state == .ok {
                // Medium: one line about their latest, or the note after a tap.
                let lines = family == .systemMedium ? (entry.note == nil ? 1 : 0) : 2
                ForEach(Array(p.s.prefix(lines)), id: \.self) { s in
                    Text(CareText.line(s, now: entry.date))
                        .font(.system(size: 11))
                        .foregroundColor(.wMuted)
                        .lineLimit(1)
                }
                if p.s.isEmpty && entry.note == nil {
                    Text("Nothing logged in the last two weeks").font(.system(size: 11)).foregroundColor(.wMuted).lineLimit(1)
                }
                if let note = entry.note, family != .systemSmall {
                    CareNoteRow(note: note, name: p.n, now: entry.date)
                }
                if family == .systemMedium {
                    CareGrid(person: p, rows: 2, cols: 4)
                } else if family == .systemLarge {
                    CareGrid(person: p, rows: 3, cols: 3)
                } else {
                    Spacer(minLength: 0)
                }
            } else {
                CareNoticeText(entry: entry)
            }
        }
        .widgetURL(link(entry.person.map { "/care-log?for=\($0.id)" } ?? (entry.state == .ok ? "/family" : "/care-log")))
        .widgetCard()
    }
}

struct CareWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "GenCareCareLog", provider: CareProvider()) { CareView(entry: $0) }
            .configurationDisplayName("Care Log")
            .description("Log care for the people your family takes care of, right from your Home Screen.")
            .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

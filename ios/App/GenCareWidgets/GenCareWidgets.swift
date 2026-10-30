import WidgetKit
import SwiftUI
import UIKit
import Security

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
    private static func dropKey(_ rejected: String) {
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
    var c = URLComponents()
    c.scheme = "gencare"
    c.host = "open"
    c.queryItems = [URLQueryItem(name: "path", value: path)]
    return c.url ?? URL(string: "gencare://open")!
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
    }
}

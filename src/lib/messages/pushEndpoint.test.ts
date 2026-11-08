import { describe, it, expect } from "vitest";
import { isAllowedPushEndpoint } from "./pushEndpoint";
import { expectImportFree } from "@/test/importFree";

describe("isAllowedPushEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc:APA91b",
    "https://android.googleapis.com/gcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
    "https://autopush.prod.mozaws.net.push.services.mozilla.com/x",
    "https://web.push.apple.com/QGv",
    "https://wns2-par02p.notify.windows.com/w/?token=x",
    "https://FCM.GoogleAPIs.com:443/fcm/send/x",
  ])("nimmt %s an", (u) => expect(isAllowedPushEndpoint(u)).toBe(true));

  it.each([
    "http://fcm.googleapis.com/fcm/send/x", // kein TLS
    "https://localhost/x",
    "https://127.0.0.1/x",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/x",
    "https://evil.example/fcm.googleapis.com",
    "https://fcm.googleapis.com.evil.example/x",
    "https://evilfcm.googleapis.com/x",
    "https://notify.windows.com/x", // ohne Subdomain: nicht der Dienst
    "https://evil-notify.windows.com.attacker.test/x",
    "https://push.services.mozilla.com.evil.test/x",
    "https://user:pw@fcm.googleapis.com/x",
    "https://fcm.googleapis.com:8443/x",
    "https://fcm.googleapis.com@evil.example/x",
    "ftp://fcm.googleapis.com/x",
    "//fcm.googleapis.com/x",
    "fcm.googleapis.com/x",
    "",
    "https://fcm.googleapis.com/" + "a".repeat(2100),
  ])("lehnt %s ab", (u) => expect(isAllowedPushEndpoint(u)).toBe(false));

  it("ist importfrei", () => {
    expectImportFree("src/lib/messages/pushEndpoint.ts");
  });

  it("lehnt Nicht-Strings ab", () => {
    for (const v of [null, undefined, 5, {}, ["https://fcm.googleapis.com/x"]]) expect(isAllowedPushEndpoint(v)).toBe(false);
  });
});

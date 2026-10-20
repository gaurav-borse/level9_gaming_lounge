const LABEL: Record<string, string> = {
  "session.start": "Started a session", "session.stop": "Stopped a session", "session.reopen": "Undid a stop", "session.extend": "Extended a session",
  "session.transfer": "Moved a session", "item.remove": "Removed an item from a tab", "bill.void": "Voided a bill",
  "customer.update": "Edited a customer",
  "menu.category.create": "Added a menu category", "menu.category.update": "Renamed a menu category", "menu.category.delete": "Deleted a menu category",
  "menu.item.create": "Added a menu item", "menu.item.update": "Changed a menu item", "menu.item.delete": "Deleted a menu item",
  "zone.create": "Added a zone", "zone.update": "Changed a zone", "zone.remove": "Deleted a zone",
  "station.create": "Added a station", "station.update": "Changed a station", "station.remove": "Deleted a station",
  "rate.save": "Saved a price", "rate.remove": "Removed a price",
  "staff.create": "Added a staff login", "staff.rename": "Renamed a person", "staff.pin_reset": "Changed a PIN", "staff.remove": "Removed a staff login",
  "settings.cafe": "Changed lounge settings", "settings.whatsapp": "Changed WhatsApp settings",
  "logo.upload": "Uploaded a logo", "logo.reset": "Changed the logo", "loginimage.upload": "Uploaded the sign-in picture", "loginimage.reset": "Reset the sign-in picture",
  "investment.add": "Added an investment", "investment.update": "Changed an investment", "investment.delete": "Removed an investment", "expense.add": "Added an expense", "expense.delete": "Removed an expense", export: "Exported to Excel",
  "backup.now": "Made a backup", "backup.folder": "Changed the backup folder", "backup.restore": "Restored a backup",
};

/** Plain words for an audit log action code; an unknown code is shown as it is. */
export const describeAction = (action: string): string => LABEL[action] ?? action;

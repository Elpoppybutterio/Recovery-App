      const repeatUnit: RepeatUnit = sponsorRepeatPreset === "MONTHLY" ? "MONTHLY" : "WEEKLY";
      const repeatInterval = sponsorRepeatPreset === "BIWEEKLY" ? 2 : 1;
      const repeatDays =
        repeatUnit === "MONTHLY"
          ? []
          : sortWeekdays(sponsorRepeatDays.filter((day) => WEEKDAY_CODES.includes(day)));
      const nextCall = computeNextCall(
        new Date(),
        callTimeLocalHhmm,
        repeatUnit,
        repeatInterval,
        repeatDays,
      ).nextAt;
      const repeatSummary =
        repeatUnit === "MONTHLY"
          ? "Monthly"
          : `${repeatInterval === 2 ? "Bi-weekly" : "Weekly"} on ${describeWeekdaySelection(repeatDays)}`;
      const reminderLeadMinutes = normalizeAlertLeadMinutes(alertLeadMinutes);
      const eventDetails: CalendarEventInput = {
        title: "Call Sponsor",
        notes: [
          `Sponsor: ${normalizedSponsorName}`,
          `Phone: ${sponsorPhoneE164}`,
          `Repeat: ${repeatSummary}`,
        ].join("\n"),
        startDate: nextCall,
        endDate: new Date(nextCall.getTime() + 15 * 60 * 1000),
        recurrenceRule: buildCalendarRecurrenceRule(
          repeatUnit,
          repeatInterval,
          repeatDays,
          calendarModule,
        ),
        alarms: [{ relativeOffset: -reminderLeadMinutes }],
      };
      const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (localTimezone) {
        eventDetails.timeZone = localTimezone;
      }

      const asyncStorage = loadAsyncStorageModule();
      const eventStorageKey = sponsorCalendarEventStorageKey(devAuthUserId);
      const notificationStorageKey = sponsorLocalNotificationStorageKey(devAuthUserId);
      const storedEventId =
        calendarEventId ??
        (asyncStorage ? await asyncStorage.getItem(eventStorageKey) : null) ??
        null;
      const storedNotificationId = asyncStorage
        ? await asyncStorage.getItem(notificationStorageKey)
        : null;

      if (storedNotificationId) {
        try {
          await Notifications.cancelScheduledNotificationAsync(storedNotificationId);
        } catch {
          // ignore
        }
        if (asyncStorage) {
          await asyncStorage.removeItem(notificationStorageKey);
        }
      }

      let resultingEventId: string;
      let updatedExistingEvent = false;

      if (storedEventId) {
        try {
          const existingEvent = await calendarModule.getEventAsync(storedEventId);
          if (!existingEvent) {
            throw new Error("Stored event deleted");
          }
          const updatedId = await calendarModule.updateEventAsync(storedEventId, eventDetails);
          resultingEventId = updatedId || storedEventId;
          updatedExistingEvent = true;
        } catch (error) {
          const message = describeError(error).toLowerCase();
          const shouldRecreate =
            message.includes("not found") ||
            message.includes("does not exist") ||
            message.includes("deleted") ||
            message.includes("no event");

          if (!shouldRecreate) {
            throw error;
          }

          resultingEventId = await calendarModule.createEventAsync(writableCalendar.id, eventDetails);
        }
      } else {
        resultingEventId = await calendarModule.createEventAsync(writableCalendar.id, eventDetails);
      }

      setCalendarEventId(resultingEventId);
      if (asyncStorage) {
        await asyncStorage.setItem(eventStorageKey, resultingEventId);
      }
      setCalendarStatusMessage(
        updatedExistingEvent ? "Sponsor calendar event updated." : "Sponsor calendar event created.",
      );
    },
    [
      alertLeadMinutes,
      calendarEventId,
      callTimeLocalHhmm,
      devAuthUserId,
      normalizedSponsorName,
      sponsorPhoneE164,
      sponsorRepeatDays,
      sponsorRepeatPreset,
    ],
  );

  const rescheduleDriveNotifications = useCallback(
    async (reason: string) => {
      await cancelNotificationBucket("drive");

      const plannedMeetings = meetingsForDay.filter(
        (meeting) => selectedDayPlan.plans[meeting.id]?.going,
      );
      if (plannedMeetings.length === 0) {
        setMeetingsStatus(
          (previous) => `${previous.split(" | ")[0]} | No planned meetings to notify.`,
        );
        return;
      }

      const hasPermission = await ensureNotificationPermission();
      if (!hasPermission) {
        setMeetingsStatus("Notification permission denied for drive alerts.");
        return;
      }
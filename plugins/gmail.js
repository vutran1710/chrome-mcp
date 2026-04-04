import { ensureTab, evaluate, realClick, sleep } from "./helpers.js";

export default {
  name: "gmail",
  url: "https://mail.google.com",

  async init(bridge) {
    const tabId = await ensureTab(bridge, "https://mail.google.com");
    await sleep(3000);
    const result = await evaluate(bridge, tabId, `
      (() => {
        // Must be on mail.google.com with actual inbox loaded
        if (location.hostname === 'mail.google.com' && document.title.includes('Inbox')) {
          return { loggedIn: true };
        }
        return { loggedIn: false, message: "Please log in to Gmail" };
      })()
    `);
    return result;
  },

  tools: {
    list_emails: {
      description: "List inbox emails with sender, subject, snippet, date, and unread status",
      async handler(bridge) {
        const tabId = await ensureTab(bridge, "https://mail.google.com");
        await sleep(1000);
        return evaluate(bridge, tabId, `
          (() => {
            const rows = document.querySelectorAll('tr.zA');
            const emails = [];
            rows.forEach(row => {
              const senderEl = row.querySelector('.yW .zF, .yW .yP');
              const snippet = (row.querySelector('.y2')?.textContent?.trim() || '').replace(/^-\\s*/, '').replace(/^- /, '');
              emails.push({
                sender: senderEl?.getAttribute('name') || '',
                email: senderEl?.getAttribute('email') || '',
                subject: row.querySelector('.bog')?.textContent?.trim() || '',
                snippet: snippet,
                date: row.querySelector('.xW span')?.getAttribute('title') || '',
                unread: row.classList.contains('zE'),
                starred: !!row.querySelector('.T-KT-Jp'),
                hasAttachment: !!row.querySelector('.yf img, .brd'),
              });
            });
            return emails;
          })()
        `);
      },
    },

    select_by_sender: {
      description: "Select emails by sender names. Params: { senders: string[] }",
      async handler(bridge, params) {
        const tabId = await ensureTab(bridge, "https://mail.google.com");
        const senders = JSON.stringify(params.senders || []);
        return realClick(bridge, tabId, `
          const targetSenders = ${senders};
          const rows = document.querySelectorAll('tr.zA');
          let selected = 0;
          rows.forEach(row => {
            const sender = row.querySelector('.yW .zF, .yW .yP');
            const name = sender?.getAttribute('name') || sender?.textContent?.trim() || '';
            if (targetSenders.includes(name)) {
              const checkbox = row.querySelector('div[role="checkbox"]');
              if (checkbox) { realClick(checkbox); selected++; }
            }
          });
          return { selected };
        `);
      },
    },

    select_all: {
      description: "Select all visible emails",
      async handler(bridge) {
        const tabId = await ensureTab(bridge, "https://mail.google.com");
        return realClick(bridge, tabId, `
          const selectAll = document.querySelector('span[role="checkbox"]');
          if (selectAll && selectAll.getAttribute('aria-checked') !== 'true') {
            realClick(selectAll);
          }
          return { checked: selectAll?.getAttribute('aria-checked') };
        `);
      },
    },

    mark_read: {
      description: "Mark selected emails as read",
      async handler(bridge) {
        const tabId = await ensureTab(bridge, "https://mail.google.com");
        return realClick(bridge, tabId, `
          const allBtns = document.querySelectorAll('[role="button"]');
          for (const btn of allBtns) {
            if (btn.getAttribute('aria-label') === 'Mark as read') {
              realClick(btn);
              return { ok: true };
            }
          }
          return { error: 'Mark as read button not found' };
        `);
      },
    },

    delete_selected: {
      description: "Delete selected emails",
      async handler(bridge) {
        const tabId = await ensureTab(bridge, "https://mail.google.com");
        return realClick(bridge, tabId, `
          const allBtns = document.querySelectorAll('[role="button"]');
          for (const btn of allBtns) {
            if (btn.getAttribute('aria-label') === 'Delete') {
              realClick(btn);
              return { ok: true };
            }
          }
          return { error: 'Delete button not found' };
        `);
      },
    },

    archive_selected: {
      description: "Archive selected emails",
      async handler(bridge) {
        const tabId = await ensureTab(bridge, "https://mail.google.com");
        return realClick(bridge, tabId, `
          const allBtns = document.querySelectorAll('[role="button"]');
          for (const btn of allBtns) {
            if (btn.getAttribute('aria-label') === 'Archive') {
              realClick(btn);
              return { ok: true };
            }
          }
          return { error: 'Archive button not found' };
        `);
      },
    },
  },
};

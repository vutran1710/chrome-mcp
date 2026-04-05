import { ensureTab, evaluate, realClick, sleep } from "./helpers.js";

export default {
  name: "gmail",
  url: "https://mail.google.com",

  async init(bridge) {
    const tabId = await ensureTab(bridge, "https://mail.google.com");
    await sleep(3000);
    return evaluate(bridge, tabId, `
      (() => {
        if (location.hostname === 'mail.google.com' && location.hash.includes('#')) {
          return { loggedIn: true };
        }
        return { loggedIn: false, message: "Please log in to Gmail" };
      })()
    `);
  },

  tools: {
    list_emails: {
      description: "List inbox emails with sender, subject, snippet, date, and unread status",
      async handler(bridge) {
        const tabId = await ensureTab(bridge, "https://mail.google.com");
        await sleep(1000);
        const emails = await evaluate(bridge, tabId, `
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
                snippet,
                date: row.querySelector('.xW span')?.getAttribute('title') || '',
                unread: row.classList.contains('zE'),
                starred: !!row.querySelector('.T-KT-Jp'),
                hasAttachment: !!row.querySelector('.yf img, .brd'),
              });
            });
            return emails;
          })()
        `);
        const items = emails || [];
        return {
          type: "json",
          data: items,
          metadata: { count: items.length, unread: items.filter(e => e.unread).length },
        };
      },
    },

    read_email: {
      description: "Read full content of an email by index. Params: { index: number }",
      async handler(bridge, params) {
        const tabId = await ensureTab(bridge, "https://mail.google.com");
        const idx = params.index || 0;

        // Click the email row to open it
        await evaluate(bridge, tabId, `
          (() => {
            const rows = document.querySelectorAll('tr.zA');
            const row = rows[${idx}];
            if (!row) return false;
            const subject = row.querySelector('.bog span, .bqe');
            if (subject) subject.click();
            else row.click();
            return true;
          })()
        `);
        await sleep(2000);

        // Read the email content
        const email = await evaluate(bridge, tabId, `
          (() => {
            const body = document.querySelector('.a3s.aiL, .ii.gt');
            const content = body?.innerText?.trim() || '';
            return {
              subject: document.querySelector('h2.hP')?.textContent?.trim() || '',
              sender: document.querySelector('.gD')?.getAttribute('name') || '',
              email: document.querySelector('.gD')?.getAttribute('email') || '',
              date: document.querySelector('.g3')?.textContent?.trim() || '',
              content: content.slice(0, 3000),
            };
          })()
        `);

        // Go back to inbox
        await evaluate(bridge, tabId, `
          (() => {
            const back = document.querySelector('[aria-label="Go back"], [aria-label="Back to Inbox"]');
            if (back) back.click();
            else location.hash = '#inbox';
          })()
        `);

        return { type: "json", data: email, metadata: {} };
      },
    },

    get_unread: {
      description: "Get all unread emails with full content. Scans inbox, opens each unread email, reads it, returns array",
      async handler(bridge) {
        const tabId = await ensureTab(bridge, "https://mail.google.com");
        await sleep(1000);

        // Get count of unread emails
        const unreadCount = await evaluate(bridge, tabId, `
          document.querySelectorAll('tr.zA.zE').length
        `);

        if (!unreadCount) {
          return { type: "json", data: [], metadata: { count: 0 } };
        }

        const emails = [];
        for (let i = 0; i < unreadCount; i++) {
          // Click the i-th unread row
          const clicked = await evaluate(bridge, tabId, `
            (() => {
              const unreadRows = document.querySelectorAll('tr.zA.zE');
              const row = unreadRows[${i}];
              if (!row) return false;
              const el = row.querySelector('.bog span, .bqe');
              if (el) el.click();
              else row.click();
              return true;
            })()
          `);

          if (!clicked) break;
          await sleep(2000);

          // Read content
          const email = await evaluate(bridge, tabId, `
            (() => {
              const body = document.querySelector('.a3s.aiL, .ii.gt');
              const content = body?.innerText?.trim() || '';
              return {
                subject: document.querySelector('h2.hP')?.textContent?.trim() || '',
                sender: document.querySelector('.gD')?.getAttribute('name') || '',
                email: document.querySelector('.gD')?.getAttribute('email') || '',
                date: document.querySelector('.g3')?.textContent?.trim() || '',
                content: content.slice(0, 3000),
              };
            })()
          `);

          if (email) emails.push(email);

          // Go back to inbox
          await evaluate(bridge, tabId, `
            (() => {
              const back = document.querySelector('[aria-label="Go back"], [aria-label="Back to Inbox"]');
              if (back) back.click();
              else location.hash = '#inbox';
            })()
          `);
          await sleep(1500);
        }

        return {
          type: "json",
          data: emails,
          metadata: { count: emails.length },
        };
      },
    },

    select_by_sender: {
      description: "Select emails by sender names. Params: { senders: string[] }",
      async handler(bridge, params) {
        const tabId = await ensureTab(bridge, "https://mail.google.com");
        const senders = JSON.stringify(params.senders || []);
        const selected = await realClick(bridge, tabId, `
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
          return selected;
        `);
        return { type: "json", data: { selected }, metadata: {} };
      },
    },

    select_all: {
      description: "Select all visible emails",
      async handler(bridge) {
        const tabId = await ensureTab(bridge, "https://mail.google.com");
        await realClick(bridge, tabId, `
          const selectAll = document.querySelector('span[role="checkbox"]');
          if (selectAll && selectAll.getAttribute('aria-checked') !== 'true') {
            realClick(selectAll);
          }
          return true;
        `);
        return { type: "text", data: "done", metadata: {} };
      },
    },

    mark_read: {
      description: "Mark selected emails as read",
      async handler(bridge) {
        const tabId = await ensureTab(bridge, "https://mail.google.com");
        await realClick(bridge, tabId, `
          const allBtns = document.querySelectorAll('[role="button"]');
          for (const btn of allBtns) {
            if (btn.getAttribute('aria-label') === 'Mark as read') {
              realClick(btn);
              return true;
            }
          }
          return false;
        `);
        return { type: "text", data: "done", metadata: {} };
      },
    },

    delete_selected: {
      description: "Delete selected emails",
      async handler(bridge) {
        const tabId = await ensureTab(bridge, "https://mail.google.com");
        await realClick(bridge, tabId, `
          const allBtns = document.querySelectorAll('[role="button"]');
          for (const btn of allBtns) {
            if (btn.getAttribute('aria-label') === 'Delete') {
              realClick(btn);
              return true;
            }
          }
          return false;
        `);
        return { type: "text", data: "done", metadata: {} };
      },
    },

    archive_selected: {
      description: "Archive selected emails",
      async handler(bridge) {
        const tabId = await ensureTab(bridge, "https://mail.google.com");
        await realClick(bridge, tabId, `
          const allBtns = document.querySelectorAll('[role="button"]');
          for (const btn of allBtns) {
            if (btn.getAttribute('aria-label') === 'Archive') {
              realClick(btn);
              return true;
            }
          }
          return false;
        `);
        return { type: "text", data: "done", metadata: {} };
      },
    },
  },
};

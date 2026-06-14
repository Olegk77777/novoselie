#!/usr/bin/env python3
# Локальный сервер для разработки «Новоселья».
# Главное отличие от `python3 -m http.server`: запрещает браузеру кэшировать файлы.
# Поэтому после каждой правки страница берёт свежие версии — не нужно жать Ctrl+Shift+R.
#
# Запуск:  python3 serve.py
# Открыть: http://localhost:8123
# Остановить: Ctrl+C

import http.server
import os
import socketserver

# По умолчанию 8123 (ручной запуск Олега: python3 serve.py → localhost:8123).
# Но харнесс-превью может задать свой порт через переменную окружения PORT —
# тогда сервер точно поднимется ИЗ ТЕКУЩЕЙ папки worktree, а не переиспользует
# чужой сервер, уже висящий на 8123 (бывало — отдавал старую версию).
PORT = int(os.environ.get('PORT', 8123))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    """Отдаёт файлы с заголовками, запрещающими кэш."""

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


if __name__ == '__main__':
    try:
        with socketserver.TCPServer(('', PORT), NoCacheHandler) as httpd:
            print(f'Новоселье запущено: http://localhost:{PORT}')
            print('Останови сервер: Ctrl+C')
            httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nСервер остановлен.')
    except OSError as e:
        # Самая частая причина — порт уже занят другим запущенным сервером
        print(f'Не удалось запустить сервер: {e}')
        print(f'Возможно, порт {PORT} уже занят. Закрой старый сервер и попробуй снова.')

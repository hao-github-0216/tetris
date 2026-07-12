/**
 * 房間碼系統
 * 生成 6 碼房間碼、驗證格式、創建/加入房間
 */
const RoomSystem = (() => {
    const PREFIX = 'TET';
    const CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // 排除 0, 1, O, I 避免混淆
    const CODE_LENGTH = 6;
    const PREFIX_LENGTH = 3;
    const VAR_LENGTH = CODE_LENGTH - PREFIX_LENGTH;
    const BASE = CHARS.length; // 36

    /** 生成亂數裝置 + 時間戳 ID */
    function generateDeviceId() {
        const arr = new Uint8Array(12);
        crypto.getRandomValues(arr);
        return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
    }

    /** 生成房間碼（例：TET7A3）*/
    function generateRoomCode() {
        let num = Math.floor(Math.random() * Math.pow(BASE, VAR_LENGTH));
        let code = '';
        for (let i = 0; i < VAR_LENGTH; i++) {
            code = CHARS[num % BASE] + code;
            num = Math.floor(num / BASE);
        }
        return PREFIX + code;
    }

    /** 驗證房間碼格式 */
    function validateRoomCode(code) {
        if (!code || typeof code !== 'string') return false;
        const upper = code.toUpperCase().trim();
        if (upper.length !== CODE_LENGTH) return false;
        if (!upper.startsWith(PREFIX)) return false;
        try {
            const varChars = upper.slice(PREFIX_LENGTH);
            for (let i = 0; i < varChars.length; i++) {
                if (CHARS.indexOf(varChars[i]) === -1) return false;
            }
            return true;
        } catch (e) {
            console.error('[RoomSystem] validateRoomCode error:', e);
            return false;
        }
    }

    /** 解析房間碼回變數部分 */
    function decodeRoomCode(code) {
        const upper = code.toUpperCase();
        if (!validateRoomCode(upper)) return null;
        const varPart = upper.slice(PREFIX_LENGTH);
        let num = 0;
        for (const ch of varPart) {
            num = num * BASE + CHARS.indexOf(ch);
        }
        return num;
    }

    // ============ ROOM CREATION ============
    /** 生成自己的玩家 ID（匿名）*/
    function generatePlayerId() {
        return 'player_' + generateDeviceId();
    }

    /**
     * 創建房間（僅做本地預處理，實際寫入由 SupabaseClient 處理）
     * @returns {{ roomCode: string, playerId: string }}
     */
    function createLocalRoom() {
        const roomCode = generateRoomCode();
        const playerId = generatePlayerId();
        return { roomCode, playerId };
    }

    /**
     * 加入房間（僅做本地預處理）
     * @param {string} roomCode
     * @returns {{ playerId: string, roomCode: string }}
     */
    function joinLocalRoom(roomCode) {
        const playerId = generatePlayerId();
        return { playerId, roomCode: roomCode.toUpperCase() };
    }

    return {
        generateRoomCode,
        validateRoomCode,
        decodeRoomCode,
        generatePlayerId,
        createLocalRoom,
        joinLocalRoom
    };
})();

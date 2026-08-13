import { getCurrentUser, supabase } from './supabaseClient.js';

const genderLabels = {
    male: '男性',
    female: '女性',
    other: 'その他',
};

const nameEl = document.getElementById('profileName');
const genderEl = document.getElementById('profileGender');
const idEl = document.getElementById('profileId');
const formEl = document.getElementById('profileForm');
const nameInput = document.getElementById('nameInput');
const genderInput = document.getElementById('genderInput');
const messageEl = document.getElementById('profileMessage');

function setMessage(text, isError = false) {
    if (!messageEl) return;
    messageEl.textContent = text;
    messageEl.classList.toggle('error', isError);
}

function formatGender(value) {
    if (!value) return '未設定';
    return genderLabels[value] || '未設定';
}

function renderProfile(user) {
    if (!user) {
        if (nameEl) nameEl.textContent = '未ログイン';
        if (genderEl) genderEl.textContent = '未ログイン';
        if (idEl) idEl.textContent = '未ログイン';
        return;
    }

    const metadata = user.user_metadata || {};
    const name = (metadata.name || metadata.full_name || '').trim();
    const genderValue = metadata.gender || '';

    if (nameEl) nameEl.textContent = name || '未設定';
    if (genderEl) genderEl.textContent = formatGender(genderValue);
    if (idEl) idEl.textContent = user.id || '未設定';

    if (nameInput) {
        nameInput.value = name;
    }
    if (genderInput) {
        genderInput.value = genderValue;
    }
}

async function loadProfile() {
    const user = await getCurrentUser();

    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    renderProfile(user);
}

if (formEl) {
    formEl.addEventListener('submit', async (event) => {
        event.preventDefault();
        setMessage('保存中...');

        try {
            const user = await getCurrentUser();
            if (!user) {
                window.location.href = 'login.html';
                return;
            }

            const name = nameInput ? nameInput.value.trim() : '';
            const gender = genderInput ? genderInput.value : '';

            const { error } = await supabase.auth.updateUser({
                data: {
                    name,
                    gender,
                },
            });

            if (error) {
                throw error;
            }

            const updatedUser = await getCurrentUser();
            renderProfile(updatedUser);
            setMessage('プロフィールを保存しました。');
        } catch (error) {
            console.error(error);
            setMessage(error.message || '保存に失敗しました。', true);
        }
    });
}

loadProfile();

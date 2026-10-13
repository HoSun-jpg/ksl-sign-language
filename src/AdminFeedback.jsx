import React from 'react';
import { Lock, ShieldCheck, Star } from 'lucide-react';
import { supabase } from './supabaseClient';

export default function AdminFeedback({ 
  adminPassword, 
  setAdminPassword, 
  isAdminAuthenticated, 
  setIsAdminAuthenticated, 
  feedbackList, 
  setFeedbackList, 
  isLoadingFeedback, 
  setIsLoadingFeedback 
}) {

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    if (adminPassword === '30400') {
      setIsAdminAuthenticated(true);
      fetchFeedbackList();
    } else {
      alert('비밀번호가 올바르지 않습니다.');
      setAdminPassword('');
    }
  };

  const fetchFeedbackList = async () => {
    setIsLoadingFeedback(true);
    try {
      const { data, error } = await supabase
        .from('app_feedback')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFeedbackList(data || []);
    } catch (err) {
      console.error('피드백 조회 실패:', err);
      alert('피드백 목록을 불러오지 못했습니다: ' + err.message);
    } finally {
      setIsLoadingFeedback(false);
    }
  };

  if (!isAdminAuthenticated) {
    return (
      <form onSubmit={handleAdminLogin} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '30px 0', gap: '12px', width: '100%', maxWidth: '720px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', boxSizing: 'border-box' }}>
        <Lock size={40} style={{ color: '#0369a1', marginBottom: '4px' }} />
        <h3 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>관리자 비밀번호 입력</h3>
        <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 10px 0' }}>심사위원 피드백을 확인하려면 비밀번호를 입력하세요.</p>
        
        <input 
          type="password"
          value={adminPassword}
          onChange={(e) => setAdminPassword(e.target.value)}
          placeholder="비밀번호 입력"
          style={{ width: '260px', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', textAlign: 'center', outline: 'none' }}
        />
        <button 
          type="submit"
          style={{ backgroundColor: '#0f172a', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: '8px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>
          로그인
        </button>
      </form>
    );
  }

  return (
    <div style={{ width: '100%', maxWidth: '720px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '24px', boxSizing: 'border-box', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 'bold', color: '#0369a1' }}>
          <ShieldCheck size={16} /> 총 {feedbackList.length}개의 피드백이 등록되었습니다.
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button 
            onClick={fetchFeedbackList}
            style={{ backgroundColor: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
            새로고침
          </button>
          <button 
            onClick={() => setIsAdminAuthenticated(false)}
            style={{ backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
            잠금
          </button>
        </div>
      </div>

      {isLoadingFeedback ? (
        <div style={{ textAlign: 'center', padding: '30px', color: '#64748b', fontSize: '13px' }}>데이터 불러오는 중...</div>
      ) : feedbackList.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '30px', color: '#64748b', fontSize: '13px' }}>아직 등록된 피드백이 없습니다.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '360px', overflowY: 'auto', paddingRight: '4px' }}>
          {feedbackList.map((item, idx) => (
            <div key={item.id || idx} style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 16px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontWeight: 'bold', fontSize: '13px', color: '#0f172a' }}>{item.evaluator_name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#d97706', fontWeight: 'bold', fontSize: '12px' }}>
                  <Star size={13} fill="#d97706" /> {item.rating}점
                </div>
              </div>
              <p style={{ fontSize: '13px', color: '#334155', margin: '0 0 6px 0', lineHeight: '1.4' }}>{item.comments || '작성된 코멘트가 없습니다.'}</p>
              <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                {new Date(item.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
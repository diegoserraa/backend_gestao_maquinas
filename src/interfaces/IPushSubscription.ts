export interface IPushSubscription {
    id?: number;
    usuario_id: number;
    endpoint: string;
    p256dh: string;
    auth: string; 
    created_at?: Date;
}
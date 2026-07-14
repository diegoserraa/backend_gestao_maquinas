export function roleMiddleware(...roles: string[]) {

    return (req, res, next) => {

        const user = req.user;

        if (!user) {
            return res.status(401).json({ error: "Não autenticado" });
        }

        if (!roles.includes(user.role)) {
            return res.status(403).json({ error: "Acesso negado" });
        }

        next();
    };
}
import multer from "multer";

// Sem limite, um upload de vários GB fica todo em memória (memoryStorage)
// até o servidor cair. 15MB cobre folga até pra fotos de celular em alta
// resolução e PDFs escaneados — os tipos aceitos (ver AnexoService) não
// passam disso em uso normal.
const TAMANHO_MAXIMO_BYTES = 15 * 1024 * 1024;

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: TAMANHO_MAXIMO_BYTES,
  },
});
/*
 * Кружочки занятия — Office Add-in для PowerPoint.
 *
 * Логика:
 *   1. Пользователь создаёт слайд из layout «Титул» или «Разделитель этапа».
 *   2. Открывает таскпейн, выбирает тип, вводит «Всего» и «Активная».
 *   3. Нажимает «Применить» — скрипт:
 *      - удаляет все shapes с именами lesson_dot_* / etap_dot_* на текущем слайде;
 *      - создаёт N новых точек по правилу раскладки (1-3 ряда для титула,
 *        шахматка, центр симметрии y=5.05 для титула / y=4.85 для разделителя);
 *      - активной даёт alpha 100, остальным alpha 35;
 *      - именует lesson_dot_K или etap_dot_K в порядке слева-направо, сверху-вниз.
 */

Office.onReady((info) => {
  if (info.host === Office.HostType.PowerPoint) {
    document.getElementById("apply").addEventListener("click", onApply);
  }
});

// ---------- Параметры раскладки ----------
const LAYOUT = {
  title: {
    centerX: 2.20,        // центр блока по X (в дюймах)
    centerY: 5.05,        // центр симметрии по Y
    stepX: 0.262,         // шаг между центрами точек
    rowStepY: 0.18,       // расстояние между рядами
    size: 0.12,           // размер точки (квадратный)
    namePrefix: "lesson_dot",
    singleRowMax: 15,     // до этого числа — один ряд
    twoRowsMax: 30        // до этого числа — два ряда, иначе три
  },
  etap: {
    startXLeftEdge: 0.60, // левый край первой точки (фиксирован)
    centerY: 4.85 + 0.18 / 2, // центр первой точки (для согласованности — y центра)
    stepX: 0.32,
    size: 0.18,
    namePrefix: "etap_dot",
    // Разделитель — всегда один ряд
    singleRowMax: 999
  }
};

// ---------- UI ----------
function showStatus(text, ok) {
  const el = document.getElementById("status");
  el.textContent = text;
  el.className = "status show " + (ok ? "ok" : "err");
}

function getInputs() {
  const type = document.querySelector('input[name="type"]:checked').value;
  const total = parseInt(document.getElementById("total").value, 10);
  const active = parseInt(document.getElementById("active").value, 10);
  return { type, total, active };
}

// ---------- Раскладка ----------
/** Разбивает total точек на ряды (массив чисел). */
function splitRows(total, type) {
  const cfg = LAYOUT[type];
  if (total <= cfg.singleRowMax) return [total];
  // Только для титула: 2 или 3 ряда
  if (total <= LAYOUT.title.twoRowsMax) {
    const top = Math.ceil(total / 2);
    return [top, total - top];
  }
  const top = Math.ceil(total / 3);
  const remaining = total - top;
  const mid = Math.ceil(remaining / 2);
  return [top, mid, remaining - mid];
}

/** Возвращает массив { x, y, size, name, active } для всех точек. */
function computePositions({ type, total, active }) {
  const cfg = LAYOUT[type];
  const rows = splitRows(total, type);
  const R = rows.length;
  const positions = [];
  let dotIdx = 1;

  for (let r = 0; r < R; r++) {
    const N_r = rows[r];
    // Y ряда: симметрия относительно cfg.centerY
    const yCenter = cfg.centerY + (r - (R - 1) / 2) * cfg.rowStepY;
    // Шахматка: чётные ряды (1, 3, ...) сдвинуты на step/2 вправо
    const shahmatkaOffset = (r % 2 === 1) ? cfg.stepX / 2 : 0;

    let xCenterFirst;
    if (type === "title") {
      // Центр блока в cfg.centerX
      xCenterFirst = cfg.centerX - (N_r - 1) * cfg.stepX / 2 + shahmatkaOffset;
    } else {
      // Разделитель: левый край первой точки фиксирован
      xCenterFirst = cfg.startXLeftEdge + cfg.size / 2;
    }

    for (let i = 0; i < N_r; i++) {
      const cx = xCenterFirst + i * cfg.stepX;
      positions.push({
        // left/top для shape — левый верхний угол
        left: cx - cfg.size / 2,
        top: yCenter - cfg.size / 2,
        size: cfg.size,
        name: `${cfg.namePrefix}_${dotIdx}`,
        active: dotIdx === active
      });
      dotIdx++;
    }
  }
  return positions;
}

// ---------- Применение к слайду ----------
async function onApply() {
  const inputs = getInputs();
  if (!inputs.total || inputs.total < 1) {
    showStatus("Укажи число «Всего точек».", false);
    return;
  }
  if (!inputs.active || inputs.active < 1 || inputs.active > inputs.total) {
    showStatus("«Активная» должна быть от 1 до «Всего».", false);
    return;
  }

  document.getElementById("apply").disabled = true;
  try {
    const positions = computePositions(inputs);
    const cfg = LAYOUT[inputs.type];

    await PowerPoint.run(async (context) => {
      const slides = context.presentation.getSelectedSlides();
      slides.load("items/id");
      await context.sync();

      if (slides.items.length === 0) {
        throw new Error("Не выбран ни один слайд. Кликни по слайду в редакторе.");
      }
      const slide = slides.items[0];

      // 1. Удалить старые кружочки
      const shapes = slide.shapes;
      shapes.load("items/name");
      await context.sync();

      const toDelete = shapes.items.filter(s =>
        typeof s.name === "string" &&
        (s.name.startsWith("lesson_dot_") || s.name.startsWith("etap_dot_"))
      );
      toDelete.forEach(s => s.delete());
      await context.sync();

      // 2. Создать новые
      for (const p of positions) {
        const shape = shapes.addGeometricShape(
          PowerPoint.GeometricShapeType.oval,
          { left: inToPt(p.left), top: inToPt(p.top),
            width: inToPt(p.size), height: inToPt(p.size) }
        );
        shape.name = p.name;
        // Без обводки
        shape.lineFormat.transparency = 1;
        // Заливка: белая
        shape.fill.setSolidColor("#FFFFFF");
        // Прозрачность: активная 0, остальные 0.65 (= alpha 35%)
        shape.fill.transparency = p.active ? 0 : 0.65;
      }
      await context.sync();
    });

    const rowsInfo = splitRows(inputs.total, inputs.type);
    showStatus(`Готово: ${inputs.total} точек, активная ${inputs.active}, рядов: ${rowsInfo.length}.`, true);
  } catch (e) {
    console.error(e);
    showStatus("Ошибка: " + (e.message || e), false);
  } finally {
    document.getElementById("apply").disabled = false;
  }
}

// Office API ожидает дюймы в pt (1 inch = 72 pt)
function inToPt(inches) { return inches * 72; }

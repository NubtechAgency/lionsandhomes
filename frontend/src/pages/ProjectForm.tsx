// Formulario de creación/edición de proyectos
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { projectAPI } from '../services/api';
import { PROJECT_CATEGORIES } from '../lib/constants';
import type { CreateProjectData, ProjectStatus, ExpenseCategory } from '../types';

// 🎨 COMPONENTE PRINCIPAL
export default function ProjectForm() {
  // 🧭 NAVEGACIÓN - Para cambiar de página
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();  // Si hay ID, estamos editando
  const isEditMode = !!id;  // TRUE si estamos editando, FALSE si estamos creando

  // 📊 ESTADOS - Los datos del formulario
  const [formData, setFormData] = useState<CreateProjectData>({
    name: '',
    description: '',
    status: 'ACTIVE',
    totalBudget: 0,
    categoryBudgets: {},
    startDate: new Date().toISOString().split('T')[0],  // Fecha de hoy en formato YYYY-MM-DD
    endDate: '',
  });

  const [isLoading, setIsLoading] = useState(false);  // ¿Estamos guardando?
  const [error, setError] = useState<string | null>(null);  // Mensaje de error
  const [isLoadingProject, setIsLoadingProject] = useState(isEditMode);  // Solo si estamos editando

  // 🎬 EFECTO - Si estamos en modo edición, cargar los datos del proyecto
  useEffect(() => {
    if (isEditMode && id) {
      loadProject(parseInt(id));
    }
  }, [id, isEditMode]);

  // 📥 FUNCIÓN - Cargar datos del proyecto para editar
  const loadProject = async (projectId: number) => {
    try {
      setIsLoadingProject(true);
      const response = await projectAPI.getProject(projectId);
      const project = response.project;

      // Llenar el formulario con los datos del proyecto
      setFormData({
        name: project.name,
        description: project.description || '',
        status: project.status,
        totalBudget: project.totalBudget,
        categoryBudgets: project.categoryBudgets,
        startDate: project.startDate.split('T')[0],  // Convertir a formato YYYY-MM-DD
        endDate: project.endDate ? project.endDate.split('T')[0] : '',
      });
    } catch (err) {
      setError('Error al cargar el proyecto');
      console.error(err);
    } finally {
      setIsLoadingProject(false);
    }
  };

  // 📝 FUNCIÓN - Actualizar campos del formulario
  const handleInputChange = (field: keyof CreateProjectData, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // 💰 FUNCIÓN - Actualizar presupuesto de una categoría específica
  const handleCategoryBudgetChange = (category: ExpenseCategory, value: string) => {
    const numValue = parseFloat(value) || 0;  // Convertir a número (0 si es inválido)

    setFormData((prev) => ({
      ...prev,
      categoryBudgets: {
        ...prev.categoryBudgets,
        [category]: numValue,
      },
    }));
  };

  // 🧮 FUNCIÓN - Calcular el total del presupuesto desglosado
  const calculateTotalFromCategories = (): number => {
    return Object.values(formData.categoryBudgets).reduce((sum, value) => sum + (value || 0), 0);
  };

  // ✅ FUNCIÓN - Validar formulario antes de enviar
  const validateForm = (): string | null => {
    if (!formData.name.trim()) {
      return 'El nombre del proyecto es obligatorio';
    }

    if (formData.totalBudget <= 0) {
      return 'El presupuesto total debe ser mayor a 0';
    }

    if (!formData.startDate) {
      return 'La fecha de inicio es obligatoria';
    }

    const categoryTotal = calculateTotalFromCategories();
    if (categoryTotal > formData.totalBudget) {
      return `El desglose del presupuesto (€${categoryTotal.toFixed(2)}) excede el presupuesto total (€${formData.totalBudget.toFixed(2)})`;
    }

    return null;  // Todo está bien
  };

  // 💾 FUNCIÓN - Enviar formulario (crear o actualizar)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();  // Evitar que la página se recargue

    // Validar antes de enviar
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      if (isEditMode && id) {
        // MODO EDICIÓN
        await projectAPI.updateProject(parseInt(id), formData);
        alert('Proyecto actualizado correctamente');
      } else {
        // MODO CREACIÓN
        await projectAPI.createProject(formData);
        alert('Proyecto creado correctamente');
      }

      // Redirigir a la lista de proyectos
      navigate('/projects');
    } catch (err: any) {
      setError(err.message || 'Error al guardar el proyecto');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // ⏳ RENDERIZADO - Mostramos "Cargando..." mientras traemos los datos del proyecto
  if (isLoadingProject) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto"></div>
          <p className="text-gray-600 mt-4">Cargando proyecto...</p>
        </div>
      </div>
    );
  }

  // 🎨 RENDERIZADO PRINCIPAL
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* 🎯 ENCABEZADO */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/projects')}
            className="text-amber-600 hover:text-amber-700 font-medium mb-4"
          >
            ← Volver a Proyectos
          </button>

          <h1 className="text-3xl font-bold text-gray-900">
            {isEditMode ? 'Editar Proyecto' : 'Crear Nuevo Proyecto'}
          </h1>
          <p className="text-gray-600 mt-2">
            {isEditMode
              ? 'Modifica los datos del proyecto existente'
              : 'Completa el formulario para crear un nuevo proyecto de remodelación'}
          </p>
        </div>

        {/* ❌ MENSAJE DE ERROR */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* 📝 FORMULARIO */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ===== INFORMACIÓN BÁSICA ===== */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Información Básica</h2>

            {/* NOMBRE */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nombre del Proyecto *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="Ej: Apartamento Gran Vía 45"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                required
              />
            </div>

            {/* DESCRIPCIÓN */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Descripción
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Describe brevemente el proyecto..."
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>

            {/* ESTADO */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Estado</label>
              <select
                value={formData.status}
                onChange={(e) => handleInputChange('status', e.target.value as ProjectStatus)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              >
                <option value="ACTIVE">🟢 Activo</option>
                <option value="COMPLETED">✅ Completado</option>
                <option value="ARCHIVED">📦 Archivado</option>
              </select>
            </div>

            {/* FECHAS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* FECHA INICIO */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fecha de Inicio *
                </label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => handleInputChange('startDate', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  required
                />
              </div>

              {/* FECHA FIN */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fecha de Fin (opcional)
                </label>
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => handleInputChange('endDate', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* ===== PRESUPUESTO ===== */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Presupuesto</h2>

            {/* PRESUPUESTO TOTAL */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Presupuesto Total (€) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.totalBudget}
                onChange={(e) => handleInputChange('totalBudget', parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-lg font-semibold"
                required
              />
            </div>

            {/* DESGLOSE POR CATEGORÍAS */}
            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Desglose por Categorías
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Asigna el presupuesto a cada categoría de gasto. La suma no debe exceder el presupuesto total.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {PROJECT_CATEGORIES.map((category) => (
                  <div key={category.key}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {category.label}
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-gray-500">€</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.categoryBudgets[category.key] || ''}
                        onChange={(e) => handleCategoryBudgetChange(category.key, e.target.value)}
                        placeholder="0.00"
                        className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* RESUMEN DEL DESGLOSE */}
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-700">Total Desglosado:</span>
                  <span className="font-semibold text-gray-900">
                    €{calculateTotalFromCategories().toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm mt-2">
                  <span className="text-gray-700">Presupuesto Total:</span>
                  <span className="font-semibold text-gray-900">
                    €{formData.totalBudget.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm mt-2 pt-2 border-t border-gray-200">
                  <span className="text-gray-700">Diferencia:</span>
                  <span
                    className={`font-semibold ${
                      formData.totalBudget - calculateTotalFromCategories() >= 0
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}
                  >
                    €{(formData.totalBudget - calculateTotalFromCategories()).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ===== BOTONES DE ACCIÓN ===== */}
          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={() => navigate('/projects')}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-semibold transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="flex items-center">
                  <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Guardando...
                </span>
              ) : (
                <span>{isEditMode ? '💾 Guardar Cambios' : '➕ Crear Proyecto'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

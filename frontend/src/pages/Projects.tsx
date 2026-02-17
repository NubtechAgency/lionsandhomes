import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectAPI, dashboardAPI } from '../services/api';
import type { Project, ProjectStatus, DashboardStats } from '../types';
import Navbar from '../components/Navbar';
import KPICard from '../components/KPICard';
import ProjectCard from '../components/ProjectCard';
import { formatCurrency } from '../lib/formatters';
import { FolderOpen, Plus, Wallet, TrendingDown, FileText } from 'lucide-react';

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<ProjectStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, [filterStatus]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const status = filterStatus === 'ALL' ? undefined : filterStatus;
      const [projectsRes, statsRes] = await Promise.all([
        projectAPI.listProjects(status),
        dashboardAPI.getStats(),
      ]);
      setProjects(projectsRes.projects.filter(p => p.name !== 'General'));
      setStats(statsRes);
    } catch (err) {
      setError('Error al cargar los proyectos');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredProjects = projects.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = projects.filter(p => p.status === 'ACTIVE').length;
  const totalBudget = projects.reduce((sum, p) => sum + p.totalBudget, 0);

  const statusFilters: { key: ProjectStatus | 'ALL'; label: string }[] = [
    { key: 'ALL', label: 'Todos' },
    { key: 'ACTIVE', label: 'Activos' },
    { key: 'COMPLETED', label: 'Completados' },
    { key: 'ARCHIVED', label: 'Archivados' },
  ];

  return (
    <div className="min-h-screen bg-amber-50/30">
      <Navbar />
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Proyectos</h1>
            <p className="text-gray-500 text-sm mt-1">
              Gestiona los proyectos de remodelación
            </p>
          </div>
          <button
            onClick={() => navigate('/projects/new')}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium"
          >
            <Plus size={18} /> Nuevo Proyecto
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <KPICard
            title="Proyectos Activos"
            value={activeCount}
            subtitle={`${projects.length} total`}
            icon={FolderOpen}
            color="amber"
          />
          <KPICard
            title="Presupuesto Total"
            value={`€${formatCurrency(totalBudget)}`}
            subtitle="Suma de todos los proyectos"
            icon={Wallet}
            color="blue"
          />
          <KPICard
            title="Gastado Este Mes"
            value={stats ? `€${formatCurrency(stats.kpis.totalSpentThisMonth)}` : '—'}
            icon={TrendingDown}
            color={stats && stats.kpis.totalSpentThisMonth > 0 ? 'red' : 'green'}
          />
          <KPICard
            title="Sin Factura"
            value={stats?.kpis.totalWithoutInvoice ?? '—'}
            subtitle="Transacciones pendientes"
            icon={FileText}
            color={stats && stats.kpis.totalWithoutInvoice > 0 ? 'red' : 'green'}
          />
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex gap-2">
            {statusFilters.map(f => (
              <button
                key={f.key}
                onClick={() => setFilterStatus(f.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filterStatus === f.key
                    ? 'bg-amber-600 text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-amber-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Buscar proyecto..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          />
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-600" />
          </div>
        ) : error ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <p className="text-red-600 font-medium">{error}</p>
            <button onClick={loadData} className="mt-3 text-amber-600 hover:underline text-sm">
              Reintentar
            </button>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <FolderOpen size={48} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-600 font-medium">No hay proyectos</p>
            <p className="text-gray-400 text-sm mt-1">
              {search ? 'Prueba con otro término de búsqueda' : 'Crea tu primer proyecto para comenzar'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.map(project => (
              <ProjectCard key={project.id} project={project} spent={project.totalSpent || 0} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
